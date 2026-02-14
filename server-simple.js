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
const CACHE_DURACION = 30000; // 30 segundos

app.use(cors());
app.use(express.json());

// ========== FUNCIÓN LEER DB CON CONTROL DE CACHE ==========
async function leerDB(forzarLectura = false) {
    const ahora = Date.now();
    
    // Si se fuerza lectura, ignorar cache
    if (forzarLectura) {
        console.log('🔄 Forzando lectura de GitHub (ignorando cache)');
        ultimaSincronizacion = 0; // Resetear timestamp
    }
    
    // Si hay cache y no ha expirado Y no se fuerza lectura, devolverlo
    if (!forzarLectura && cacheDB && (ahora - ultimaSincronizacion) < CACHE_DURACION) {
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
                categorias: [],
                vendedoras: [],
                productos: [],
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
        
        if (cacheDB) {
            console.log('⚠️ Usando caché como fallback por error');
            return cacheDB;
        }
        
        return { categorias: [], vendedoras: [], productos: [], ventas: [] };
    }
}

// ========== FUNCIÓN ESCRIBIR DB CON INVALIDACIÓN DE CACHE ==========
async function escribirDB(db, reintentos = 3) {
    try {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
        const getResponse = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let sha = null;
        if (getResponse.status === 200) {
            const existing = await getResponse.json();
            sha = existing.sha;
        }

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
            
            if (errorData.message && errorData.message.includes('sha') && reintentos > 0) {
                console.log('🔄 SHA desactualizado, reintentando...');
                await leerDB(true);
                return escribirDB(db, reintentos - 1);
            }
            
            console.error('❌ Error escribiendo en GitHub:', errorData);
            return false;
        }

        // ¡CAMBIO CLAVE! Forzar que la próxima lectura vaya a GitHub
        cacheDB = db;
        ultimaSincronizacion = 0; // Resetear timestamp para invalidar cache
        
        console.log('✅ Datos guardados en GitHub. Cache invalidado.');
        return true;
        
    } catch (error) {
        console.error('❌ Error escribiendo en GitHub:', error);
        
        if (reintentos > 0) {
            console.log(`🔄 Reintentando (${reintentos} intentos restantes)...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return escribirDB(db, reintentos - 1);
        }
        
        return false;
    }
}

// Endpoint para forzar recarga del cache (útil para depuración)
app.post('/api/recargar-cache', async (req, res) => {
    await leerDB(true);
    res.json({ success: true, mensaje: 'Cache recargado' });
});

// ========== RUTAS PÚBLICAS ==========
app.get('/', async (req, res) => {
    const db = await leerDB();
    res.json({
        mensaje: '✅ SERVIDOR CON GITHUB + CACHE INTELIGENTE',
        timestamp: new Date().toISOString(),
        categorias: db.categorias.length,
        vendedoras: db.vendedoras.length,
        productos: db.productos.length,
        repo: GITHUB_REPO,
        cache_activo: cacheDB ? true : false
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
    const db = await leerDB(true);
    
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
        await leerDB(true); // Forzar recarga del cache
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
        await leerDB(true);
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
        await leerDB(true);
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
        await leerDB(true);
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
        await leerDB(true);
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
        await leerDB(true);
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
        await leerDB(true);
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
        await leerDB(true);
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'No se pudo guardar en GitHub' });
    }
});

// ========== RUTAS PARA REPORTES ==========

// Obtener todos los reportes (para dueño)
app.get('/api/reportes', async (req, res) => {
    try {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/reporte.json`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.status === 404) {
            return res.json([]);
        }

        const data = await response.json();
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        const reportes = JSON.parse(content);
        
        res.json(reportes);
    } catch (error) {
        console.error('Error leyendo reportes:', error);
        res.status(500).json({ error: 'Error al leer reportes' });
    }
});

// Guardar un nuevo reporte (desde vendedora)
app.post('/api/reportes', async (req, res) => {
    try {
        const nuevoReporte = req.body;
        
        // Validar datos mínimos
        if (!nuevoReporte.titulo || !nuevoReporte.vendedora || !nuevoReporte.fecha) {
            return res.status(400).json({ error: 'Datos incompletos' });
        }

        // Leer reportes existentes
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/reporte.json`;
        let reportes = [];
        let sha = null;

        const getResponse = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (getResponse.status === 200) {
            const existing = await getResponse.json();
            sha = existing.sha;
            const content = Buffer.from(existing.content, 'base64').toString('utf8');
            reportes = JSON.parse(content);
        }

        // Agregar nuevo reporte
        reportes.push(nuevoReporte);

        // Guardar en GitHub
        const content = Buffer.from(JSON.stringify(reportes, null, 2)).toString('base64');
        const body = {
            message: `Nuevo reporte de ${nuevoReporte.vendedora} - ${new Date().toLocaleString()}`,
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
            throw new Error('Error al guardar reporte');
        }

        res.json({ success: true, reporte: nuevoReporte });
    } catch (error) {
        console.error('Error guardando reporte:', error);
        res.status(500).json({ error: 'Error al guardar reporte' });
    }
});

// Eliminar un reporte (para dueño)
app.delete('/api/reportes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/reporte.json`;
        const getResponse = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (getResponse.status !== 200) {
            return res.status(404).json({ error: 'No hay reportes' });
        }

        const existing = await getResponse.json();
        const sha = existing.sha;
        const content = Buffer.from(existing.content, 'base64').toString('utf8');
        let reportes = JSON.parse(content);

        // Filtrar el reporte a eliminar
        reportes = reportes.filter(r => r.id !== id);

        // Guardar cambios
        const newContent = Buffer.from(JSON.stringify(reportes, null, 2)).toString('base64');
        const body = {
            message: `Reporte eliminado - ${new Date().toLocaleString()}`,
            content: newContent,
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
            throw new Error('Error al eliminar reporte');
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error eliminando reporte:', error);
        res.status(500).json({ error: 'Error al eliminar reporte' });
    }
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, () => {
    console.log(`\n🚀===========================================`);
    console.log(`✅ SERVIDOR CON GITHUB + CACHE INTELIGENTE`);
    console.log(`=============================================`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`📁 Repositorio: ${GITHUB_REPO}`);
    console.log(`⏱️  Cache: ${CACHE_DURACION / 1000} segundos`);
    console.log(`=============================================\n`);
});
