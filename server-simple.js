const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Variables de entorno
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_PATH = process.env.GITHUB_PATH || 'database.json';

// ========== CACHE EN MEMORIA ==========
let cacheDB = null;
let ultimaSincronizacion = 0;
const CACHE_DURACION = 30000; // 30 segundos (puedes ajustar)

app.use(cors());
app.use(express.json());

// ========== FUNCIONES PARA GITHUB CON CACHE Y CONTROL DE CONFLICTOS ==========
async function leerDB(ignorarCache = false) {
    const ahora = Date.now();
    
    // Si hay cache y no ha expirado, devolverlo
    if (!ignorarCache && cacheDB && (ahora - ultimaSincronizacion) < CACHE_DURACION) {
        console.log('📦 Usando datos en caché');
        return cacheDB;
    }
    
    try {
        console.log('🌐 Solicitando datos a GitHub...');
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.status === 404) {
            console.log('📁 Archivo no encontrado en GitHub, creando uno nuevo...');
            const initialDB = {
                categorias: [
                    { id: 'cat_1', nombre: 'Ropa', descripcion: 'Prendas de vestir', activa: true },
                    { id: 'cat_2', nombre: 'Calzado', descripcion: 'Zapatos y zapatillas', activa: true },
                    { id: 'cat_3', nombre: 'Accesorios', descripcion: 'Bolsos, carteras, joyas', activa: true },
                    { id: 'cat_4', nombre: 'Electrónica', descripcion: 'Dispositivos electrónicos', activa: true },
                    { id: 'cat_5', nombre: 'Hogar', descripcion: 'Artículos para el hogar', activa: true },
                    { id: 'cat_6', nombre: 'Otros', descripcion: 'Productos varios', activa: true }
                ],
                vendedoras: [
                    { id: 'v_1', nombre: 'María González', usuario: 'maria_g', password: '123456', status: 'activa', tienda: 'Tienda Centro' },
                    { id: 'v_2', nombre: 'Ana Rodríguez', usuario: 'ana_r', password: '123456', status: 'activa', tienda: 'Tienda Norte' }
                ],
                productos: [
                    { id: 'p_1', nombre: 'PRODUCTO DE PRUEBA', categoria: 'cat_1', precio: 99.99, stock: 100, minStock: 10, status: 'activo' }
                ],
                ventas: []
            };
            await escribirDB(initialDB);
            cacheDB = initialDB;
            ultimaSincronizacion = ahora;
            return initialDB;
        }

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        const db = JSON.parse(content);
        
        // Actualizar cache
        cacheDB = db;
        ultimaSincronizacion = ahora;
        console.log('✅ Datos actualizados desde GitHub');
        
        return db;
    } catch (error) {
        console.error('❌ Error leyendo de GitHub:', error);
        
        // Si hay cache aunque sea viejo, devolverlo como fallback
        if (cacheDB) {
            console.log('⚠️ Usando caché como fallback por error');
            return cacheDB;
        }
        
        return { categorias: [], vendedoras: [], productos: [], ventas: [] };
    }
}

async function escribirDB(db, reintentos = 3) {
    try {
        // Primero obtenemos el archivo actual para conocer su SHA
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
        const getResponse = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let sha = null;
        let versionRemota = null;
        
        if (getResponse.status === 200) {
            const existing = await getResponse.json();
            sha = existing.sha;
            // Guardar versión remota para comparar
            const contentRemoto = Buffer.from(existing.content, 'base64').toString('utf8');
            versionRemota = JSON.parse(contentRemoto);
        }

        // Verificar conflictos: comparar si alguien más modificó mientras tanto
        if (versionRemota && cacheDB) {
            // Comparar timestamps o contenido (implementación simple)
            const cambiosRemotos = JSON.stringify(versionRemota) !== JSON.stringify(cacheDB);
            
            if (cambiosRemotos && reintentos < 3) {
                console.log('⚠️ Conflicto detectado. Intentando resolver...');
                
                // Estrategia: fusionar cambios (en este caso, preferir los locales)
                // Pero para evitar pérdida, podrías implementar una fusión más sofisticada
                const dbFusionada = fusionarDBs(versionRemota, db);
                
                // Actualizar cache con la versión fusionada
                cacheDB = dbFusionada;
                ultimaSincronizacion = Date.now();
                
                // Reintentar con la versión fusionada
                return escribirDB(dbFusionada, reintentos - 1);
            }
        }

        // Codificar el contenido a base64
        const content = Buffer.from(JSON.stringify(db, null, 2)).toString('base64');

        const body = {
            message: `Actualización automática - ${new Date().toLocaleString()}`,
            content: content,
            sha: sha
        };

        const putResponse = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!putResponse.ok) {
            const errorData = await putResponse.json();
            
            // Si el error es por SHA desactualizado (conflicto), reintentar
            if (errorData.message && errorData.message.includes('sha') && reintentos > 0) {
                console.log('🔄 SHA desactualizado, reintentando...');
                // Forzar recarga de GitHub
                await leerDB(true); // Ignorar cache
                return escribirDB(db, reintentos - 1);
            }
            
            console.error('❌ Error escribiendo en GitHub:', errorData);
            return false;
        }

        // Actualizar cache después de escribir exitosamente
        cacheDB = db;
        ultimaSincronizacion = Date.now();
        
        console.log('✅ Datos guardados en GitHub');
        return true;
        
    } catch (error) {
        console.error('❌ Error escribiendo en GitHub:', error);
        
        if (reintentos > 0) {
            console.log(`🔄 Reintentando (${reintentos} intentos restantes)...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo
            return escribirDB(db, reintentos - 1);
        }
        
        return false;
    }
}

// Función para fusionar dos versiones de la base de datos
function fusionarDBs(remota, local) {
    console.log('🔄 Fusionando cambios remotos y locales...');
    
    // Crear una copia profunda de la versión remota como base
    const fusionada = JSON.parse(JSON.stringify(remota));
    
    // Fusionar categorías (mantener ambas, evitar duplicados por ID)
    const categoriasMap = new Map();
    [...remota.categorias, ...local.categorias].forEach(c => {
        categoriasMap.set(c.id, c);
    });
    fusionada.categorias = Array.from(categoriasMap.values());
    
    // Fusionar vendedoras
    const vendedorasMap = new Map();
    [...remota.vendedoras, ...local.vendedoras].forEach(v => {
        vendedorasMap.set(v.id, v);
    });
    fusionada.vendedoras = Array.from(vendedorasMap.values());
    
    // Fusionar productos
    const productosMap = new Map();
    [...remota.productos, ...local.productos].forEach(p => {
        productosMap.set(p.id, p);
    });
    fusionada.productos = Array.from(productosMap.values());
    
    // Fusionar ventas
    const ventasMap = new Map();
    [...remota.ventas, ...local.ventas].forEach(v => {
        ventasMap.set(v.id, v);
    });
    fusionada.ventas = Array.from(ventasMap.values());
    
    console.log('✅ Fusión completada');
    return fusionada;
}

// Endpoint para forzar recarga del cache (útil para depuración)
app.post('/api/recargar-cache', async (req, res) => {
    await leerDB(true); // Forzar recarga
    res.json({ success: true, mensaje: 'Cache recargado' });
});

// ========== RUTAS PÚBLICAS ==========
app.get('/', async (req, res) => {
    const db = await leerDB();
    res.json({
        mensaje: '✅ SERVIDOR CON GITHUB COMO BD + CACHE',
        timestamp: new Date().toISOString(),
        categorias: db.categorias.length,
        vendedoras: db.vendedoras.length,
        productos: db.productos.length,
        repo: GITHUB_REPO,
        cache_activo: cacheDB ? true : false,
        ultima_sincronizacion: new Date(ultimaSincronizacion).toLocaleString()
    });
});

// ========== RUTAS PARA CATEGORÍAS ==========
app.get('/api/categorias', async (req, res) => {
    const db = await leerDB();
    const categoriasActivas = db.categorias.filter(c => c.activa !== false);
    res.json(categoriasActivas);
});

app.get('/api/dueno/categorias', async (req, res) => {
    const db = await leerDB();
    res.json(db.categorias);
});

app.post('/api/dueno/categorias', async (req, res) => {
    const { nombre, descripcion } = req.body;
    const db = await leerDB(true); // Forzar lectura fresca para evitar conflictos
    
    if (!nombre) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    
    const nuevaCategoria = {
        id: `cat_${Date.now()}`,
        nombre,
        descripcion: descripcion || '',
        activa: true
    };
    
    db.categorias.push(nuevaCategoria);
    const exito = await escribirDB(db);
    
    if (exito) {
        res.json({ success: true, categoria: nuevaCategoria });
    } else {
        res.status(500).json({ error: 'No se pudo guardar en GitHub' });
    }
});

app.put('/api/dueno/categorias/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, activa } = req.body;
    const db = await leerDB(true);
    
    const index = db.categorias.findIndex(c => c.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    
    db.categorias[index] = {
        ...db.categorias[index],
        nombre: nombre || db.categorias[index].nombre,
        descripcion: descripcion !== undefined ? descripcion : db.categorias[index].descripcion,
        activa: activa !== undefined ? activa : db.categorias[index].activa
    };
    
    const exito = await escribirDB(db);
    if (exito) {
        res.json({ success: true, categoria: db.categorias[index] });
    } else {
        res.status(500).json({ error: 'No se pudo guardar en GitHub' });
    }
});

app.delete('/api/dueno/categorias/:id', async (req, res) => {
    const { id } = req.params;
    const db = await leerDB(true);
    
    const productosUsando = db.productos.filter(p => p.categoria === id);
    if (productosUsando.length > 0) {
        return res.status(400).json({
            error: 'No se puede eliminar: hay productos usando esta categoría',
            productos: productosUsando.map(p => p.nombre)
        });
    }
    
    const index = db.categorias.findIndex(c => c.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    
    db.categorias.splice(index, 1);
    const exito = await escribirDB(db);
    
    if (exito) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'No se pudo guardar en GitHub' });
    }
});

// ========== RUTAS PARA VENDEDORAS ==========
app.post('/api/login', async (req, res) => {
    const { usuario, password } = req.body;
    const db = await leerDB();
    
    const vendedora = db.vendedoras.find(v =>
        v.usuario === usuario && v.password === password && v.status === 'activa'
    );
    
    if (vendedora) {
        res.json({
            success: true,
            usuario: {
                id: vendedora.id,
                nombre: vendedora.nombre,
                usuario: vendedora.usuario,
                tienda: vendedora.tienda
            }
        });
    } else {
        res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
    }
});

app.get('/api/productos', async (req, res) => {
    const db = await leerDB();
    const productosConCategoria = db.productos.map(p => {
        const categoria = db.categorias.find(c => c.id === p.categoria);
        return { ...p, categoria_nombre: categoria ? categoria.nombre : 'Sin categoría' };
    });
    res.json(productosConCategoria);
});

// ========== RUTAS PARA DUEÑO - VENDEDORAS ==========
app.get('/api/dueno/vendedoras', async (req, res) => {
    const db = await leerDB();
    const vendedorasSinPass = db.vendedoras.map(v => ({
        id: v.id,
        nombre: v.nombre,
        usuario: v.usuario,
        status: v.status,
        tienda: v.tienda
    }));
    res.json(vendedorasSinPass);
});

app.post('/api/dueno/vendedoras', async (req, res) => {
    const { nombre, usuario, password, tienda } = req.body;
    const db = await leerDB(true);
    
    const existe = db.vendedoras.find(v => v.usuario === usuario);
    if (existe) {
        return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    const nuevaVendedora = {
        id: `v_${Date.now()}`,
        nombre,
        usuario,
        password,
        status: 'activa',
        tienda: tienda || 'Tienda General'
    };
    
    db.vendedoras.push(nuevaVendedora);
    const exito = await escribirDB(db);
    
    if (exito) {
        res.json({
            success: true,
            vendedora: {
                id: nuevaVendedora.id,
                nombre: nuevaVendedora.nombre,
                usuario: nuevaVendedora.usuario,
                status: nuevaVendedora.status,
                tienda: nuevaVendedora.tienda
            }
        });
    } else {
        res.status(500).json({ error: 'No se pudo guardar en GitHub' });
    }
});

app.delete('/api/dueno/vendedoras/:id', async (req, res) => {
    const { id } = req.params;
    const db = await leerDB(true);
    
    const index = db.vendedoras.findIndex(v => v.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Vendedora no encontrada' });
    }
    
    db.vendedoras.splice(index, 1);
    const exito = await escribirDB(db);
    
    if (exito) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'No se pudo guardar en GitHub' });
    }
});

// ========== RUTAS PARA DUEÑO - PRODUCTOS ==========
app.get('/api/dueno/productos', async (req, res) => {
    const db = await leerDB();
    const productosConCategoria = db.productos.map(p => {
        const categoria = db.categorias.find(c => c.id === p.categoria);
        return { ...p, categoria_nombre: categoria ? categoria.nombre : 'Sin categoría' };
    });
    res.json(productosConCategoria);
});

app.post('/api/dueno/productos', async (req, res) => {
    const { nombre, categoria, precio, stock, minStock } = req.body;
    const db = await leerDB(true);
    
    if (!nombre || !precio || stock === undefined) {
        return res.status(400).json({ error: 'Nombre, precio y stock son obligatorios' });
    }
    
    let categoriaId = null;
    if (categoria) {
        const categoriaValida = db.categorias.find(c => c.id === categoria);
        if (categoriaValida) categoriaId = categoria;
    }
    
    const nuevoProducto = {
        id: `p_${Date.now()}`,
        nombre,
        categoria: categoriaId,
        precio: parseFloat(precio),
        stock: parseInt(stock),
        minStock: parseInt(minStock) || 5,
        status: parseInt(stock) > (parseInt(minStock) || 5) ? 'activo' : 'bajo stock'
    };
    
    db.productos.push(nuevoProducto);
    const exito = await escribirDB(db);
    
    if (exito) {
        const categoriaNombre = categoriaId ? (db.categorias.find(c => c.id === categoriaId)?.nombre || 'Sin categoría') : 'Sin categoría';
        res.json({ success: true, producto: { ...nuevoProducto, categoria_nombre: categoriaNombre } });
    } else {
        res.status(500).json({ error: 'No se pudo guardar en GitHub' });
    }
});

app.put('/api/dueno/productos/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, precio, stock, categoria, minStock } = req.body;
    const db = await leerDB(true);
    
    const index = db.productos.findIndex(p => p.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    db.productos[index] = {
        ...db.productos[index],
        nombre: nombre || db.productos[index].nombre,
        precio: precio !== undefined ? parseFloat(precio) : db.productos[index].precio,
        stock: stock !== undefined ? parseInt(stock) : db.productos[index].stock,
        categoria: categoria !== undefined ? categoria : db.productos[index].categoria,
        minStock: minStock !== undefined ? parseInt(minStock) : db.productos[index].minStock
    };
    
    db.productos[index].status = db.productos[index].stock <= db.productos[index].minStock ? 'bajo stock' : 'activo';
    
    const exito = await escribirDB(db);
    
    if (exito) {
        const categoriaNombre = db.productos[index].categoria ? (db.categorias.find(c => c.id === db.productos[index].categoria)?.nombre || 'Sin categoría') : 'Sin categoría';
        res.json({ success: true, producto: { ...db.productos[index], categoria_nombre: categoriaNombre } });
    } else {
        res.status(500).json({ error: 'No se pudo guardar en GitHub' });
    }
});

app.delete('/api/dueno/productos/:id', async (req, res) => {
    const { id } = req.params;
    const db = await leerDB(true);
    
    const index = db.productos.findIndex(p => p.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    db.productos.splice(index, 1);
    const exito = await escribirDB(db);
    
    if (exito) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'No se pudo guardar en GitHub' });
    }
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, () => {
    console.log(`\n🚀===========================================`);
    console.log(`✅ SERVIDOR CON GITHUB + CACHE + CONTROL DE CONFLICTOS`);
    console.log(`=============================================`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`📁 Repositorio: ${GITHUB_REPO}`);
    console.log(`🔑 Token configurado: ${GITHUB_TOKEN ? 'Sí' : 'No'}`);
    console.log(`⏱️  Cache activo: ${CACHE_DURACION / 1000} segundos`);
    console.log(`=============================================\n`);
});
