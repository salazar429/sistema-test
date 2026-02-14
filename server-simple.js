const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Necesitarás instalarlo: npm install node-fetch

const app = express();
const PORT = process.env.PORT || 3000;

// Variables de entorno
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // formato "usuario/repo"
const GITHUB_PATH = process.env.GITHUB_PATH || 'database.json';

app.use(cors());
app.use(express.json());

// ========== FUNCIONES PARA LEER/ESCRIBIR EN GITHUB ==========
async function leerDB() {
    try {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.status === 404) {
            console.log('📁 Archivo no encontrado en GitHub, creando uno nuevo...');
            // Datos iniciales (los mismos que antes)
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
            return initialDB;
        }

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();
        // El contenido viene en base64
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('❌ Error leyendo de GitHub:', error);
        // En caso de error, devolvemos estructura vacía (pero no debería ocurrir)
        return { categorias: [], vendedoras: [], productos: [], ventas: [] };
    }
}

async function escribirDB(db) {
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
        if (getResponse.status === 200) {
            const existing = await getResponse.json();
            sha = existing.sha;
        }

        // Codificar el contenido a base64
        const content = Buffer.from(JSON.stringify(db, null, 2)).toString('base64');

        const body = {
            message: 'Actualización automática desde servidor',
            content: content,
            sha: sha // si es null, creará el archivo
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
            const errorText = await putResponse.text();
            console.error('❌ Error escribiendo en GitHub:', errorText);
            return false;
        }

        console.log('✅ Datos guardados en GitHub');
        return true;
    } catch (error) {
        console.error('❌ Error escribiendo en GitHub:', error);
        return false;
    }
}

// ========== RUTAS PÚBLICAS ==========
app.get('/', async (req, res) => {
    const db = await leerDB();
    res.json({
        mensaje: '✅ SERVIDOR CON GITHUB COMO BD',
        timestamp: new Date().toISOString(),
        categorias: db.categorias.length,
        vendedoras: db.vendedoras.length,
        productos: db.productos.length,
        repo: GITHUB_REPO
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
    const db = await leerDB();
    
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
    await escribirDB(db);
    
    res.json({ success: true, categoria: nuevaCategoria });
});

app.put('/api/dueno/categorias/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, activa } = req.body;
    const db = await leerDB();
    
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
    
    await escribirDB(db);
    res.json({ success: true, categoria: db.categorias[index] });
});

app.delete('/api/dueno/categorias/:id', async (req, res) => {
    const { id } = req.params;
    const db = await leerDB();
    
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
    await escribirDB(db);
    
    res.json({ success: true });
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
    const db = await leerDB();
    
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
    await escribirDB(db);
    
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
});

app.delete('/api/dueno/vendedoras/:id', async (req, res) => {
    const { id } = req.params;
    const db = await leerDB();
    
    const index = db.vendedoras.findIndex(v => v.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Vendedora no encontrada' });
    }
    
    db.vendedoras.splice(index, 1);
    await escribirDB(db);
    res.json({ success: true });
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
    const db = await leerDB();
    
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
    await escribirDB(db);
    
    const categoriaNombre = categoriaId ? (db.categorias.find(c => c.id === categoriaId)?.nombre || 'Sin categoría') : 'Sin categoría';
    
    res.json({ success: true, producto: { ...nuevoProducto, categoria_nombre: categoriaNombre } });
});

app.put('/api/dueno/productos/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, precio, stock, categoria, minStock } = req.body;
    const db = await leerDB();
    
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
    
    await escribirDB(db);
    
    const categoriaNombre = db.productos[index].categoria ? (db.categorias.find(c => c.id === db.productos[index].categoria)?.nombre || 'Sin categoría') : 'Sin categoría';
    
    res.json({ success: true, producto: { ...db.productos[index], categoria_nombre: categoriaNombre } });
});

app.delete('/api/dueno/productos/:id', async (req, res) => {
    const { id } = req.params;
    const db = await leerDB();
    
    const index = db.productos.findIndex(p => p.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    db.productos.splice(index, 1);
    await escribirDB(db);
    res.json({ success: true });
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, () => {
    console.log(`\n🚀===========================================`);
    console.log(`✅ SERVIDOR CON GITHUB COMO BD`);
    console.log(`=============================================`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`📁 Repositorio: ${GITHUB_REPO}`);
    console.log(`🔑 Token configurado: ${GITHUB_TOKEN ? 'Sí' : 'No'}`);
    console.log(`=============================================\n`);
});
