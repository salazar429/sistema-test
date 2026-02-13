const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());

// ========== FUNCIONES JSON CON RESPALDO ==========
function leerDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            // Datos iniciales completos
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
                    { 
                        id: 'p_1', 
                        nombre: 'PRODUCTO DE PRUEBA', 
                        categoria: 'cat_1', 
                        categoria_nombre: 'Ropa',
                        precio: 99.99, 
                        stock: 100, 
                        minStock: 10, 
                        status: 'activo' 
                    }
                ],
                ventas: []
            };
            fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2));
            console.log('✅ Archivo database.json creado con datos iniciales');
            return initialDB;
        }
        
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ Error leyendo database.json:', error);
        return { categorias: [], vendedoras: [], productos: [], ventas: [] };
    }
}

function escribirDB(data) {
    try {
        // Hacer backup automático antes de escribir
        if (fs.existsSync(DB_FILE)) {
            const backupFile = DB_FILE.replace('.json', '_backup.json');
            fs.copyFileSync(DB_FILE, backupFile);
        }
        
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        console.log('💾 Cambios guardados en database.json');
        return true;
    } catch (error) {
        console.error('❌ Error guardando database.json:', error);
        return false;
    }
}

// ========== RUTAS PÚBLICAS ==========
app.get('/', (req, res) => {
    const db = leerDB();
    res.json({
        mensaje: '✅ SERVIDOR CON PERSISTENCIA JSON',
        timestamp: new Date().toISOString(),
        categorias: db.categorias.length,
        vendedoras: db.vendedoras.length,
        productos: db.productos.length
    });
});

// ========== RUTAS PARA CATEGORÍAS ==========
app.get('/api/categorias', (req, res) => {
    const db = leerDB();
    res.json(db.categorias.filter(c => c.activa !== false));
});

app.get('/api/dueno/categorias', (req, res) => {
    const db = leerDB();
    res.json(db.categorias);
});

app.post('/api/dueno/categorias', (req, res) => {
    const { nombre, descripcion } = req.body;
    const db = leerDB();
    
    if (!nombre) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    
    const nuevaCategoria = {
        id: `cat_${Date.now()}`,
        nombre: nombre,
        descripcion: descripcion || '',
        activa: true
    };
    
    db.categorias.push(nuevaCategoria);
    escribirDB(db);
    
    res.json({ success: true, categoria: nuevaCategoria });
});

app.put('/api/dueno/categorias/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, activa } = req.body;
    const db = leerDB();
    
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
    
    escribirDB(db);
    res.json({ success: true, categoria: db.categorias[index] });
});

app.delete('/api/dueno/categorias/:id', (req, res) => {
    const { id } = req.params;
    const db = leerDB();
    
    // Verificar si hay productos usando esta categoría
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
    escribirDB(db);
    
    res.json({ success: true });
});

// ========== RUTAS PARA VENDEDORAS ==========
app.post('/api/login', (req, res) => {
    const { usuario, password } = req.body;
    const db = leerDB();
    
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

app.get('/api/productos', (req, res) => {
    const db = leerDB();
    // Enriquecer productos con nombre de categoría
    const productosConCategoria = db.productos.map(p => {
        const categoria = db.categorias.find(c => c.id === p.categoria);
        return {
            ...p,
            categoria_nombre: categoria ? categoria.nombre : 'General'
        };
    });
    res.json(productosConCategoria);
});

// ========== RUTAS PARA DUEÑO - VENDEDORAS ==========
app.get('/api/dueno/vendedoras', (req, res) => {
    const db = leerDB();
    const vendedorasSinPass = db.vendedoras.map(v => ({
        id: v.id,
        nombre: v.nombre,
        usuario: v.usuario,
        status: v.status,
        tienda: v.tienda
    }));
    res.json(vendedorasSinPass);
});

app.post('/api/dueno/vendedoras', (req, res) => {
    const { nombre, usuario, password, tienda } = req.body;
    const db = leerDB();
    
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
    escribirDB(db);
    
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

app.delete('/api/dueno/vendedoras/:id', (req, res) => {
    const { id } = req.params;
    const db = leerDB();
    
    const index = db.vendedoras.findIndex(v => v.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Vendedora no encontrada' });
    }
    
    db.vendedoras.splice(index, 1);
    escribirDB(db);
    res.json({ success: true });
});

// ========== RUTAS PARA DUEÑO - PRODUCTOS ==========
app.get('/api/dueno/productos', (req, res) => {
    const db = leerDB();
    // Enriquecer productos con nombre de categoría
    const productosConCategoria = db.productos.map(p => {
        const categoria = db.categorias.find(c => c.id === p.categoria);
        return {
            ...p,
            categoria_nombre: categoria ? categoria.nombre : 'General'
        };
    });
    res.json(productosConCategoria);
});

app.post('/api/dueno/productos', (req, res) => {
    const { nombre, categoria, precio, stock, minStock } = req.body;
    const db = leerDB();
    
    if (!nombre || !precio || stock === undefined) {
        return res.status(400).json({ error: 'Nombre, precio y stock son obligatorios' });
    }
    
    // Verificar que la categoría existe
    const categoriaValida = db.categorias.find(c => c.id === categoria);
    const categoriaId = categoriaValida ? categoria : 'cat_6'; // Por defecto "Otros"
    
    const nuevoProducto = {
        id: `p_${Date.now()}`,
        nombre: nombre,
        categoria: categoriaId,
        precio: parseFloat(precio),
        stock: parseInt(stock),
        minStock: parseInt(minStock) || 5,
        status: parseInt(stock) > (parseInt(minStock) || 5) ? 'activo' : 'bajo stock'
    };
    
    db.productos.push(nuevoProducto);
    escribirDB(db);
    
    // Devolver con nombre de categoría
    const categoriaNombre = db.categorias.find(c => c.id === categoriaId)?.nombre || 'General';
    
    res.json({
        success: true,
        producto: {
            ...nuevoProducto,
            categoria_nombre: categoriaNombre
        }
    });
});

app.put('/api/dueno/productos/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, precio, stock, categoria, minStock } = req.body;
    const db = leerDB();
    
    const index = db.productos.findIndex(p => p.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    db.productos[index] = {
        ...db.productos[index],
        nombre: nombre || db.productos[index].nombre,
        precio: precio !== undefined ? parseFloat(precio) : db.productos[index].precio,
        stock: stock !== undefined ? parseInt(stock) : db.productos[index].stock,
        categoria: categoria || db.productos[index].categoria,
        minStock: minStock !== undefined ? parseInt(minStock) : db.productos[index].minStock
    };
    
    db.productos[index].status = db.productos[index].stock <= db.productos[index].minStock 
        ? 'bajo stock' 
        : 'activo';
    
    escribirDB(db);
    
    // Devolver con nombre de categoría
    const categoriaNombre = db.categorias.find(c => c.id === db.productos[index].categoria)?.nombre || 'General';
    
    res.json({ 
        success: true, 
        producto: {
            ...db.productos[index],
            categoria_nombre: categoriaNombre
        }
    });
});

app.delete('/api/dueno/productos/:id', (req, res) => {
    const { id } = req.params;
    const db = leerDB();
    
    const index = db.productos.findIndex(p => p.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    db.productos.splice(index, 1);
    escribirDB(db);
    
    res.json({ success: true });
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, () => {
    console.log(`\n🚀===========================================`);
    console.log(`✅ SERVIDOR JSON CON CATEGORÍAS`);
    console.log(`=============================================`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`📁 Archivo: database.json (con respaldo automático)`);
    console.log(`\n📦 ENDPOINTS NUEVOS:`);
    console.log(`   GET    /api/categorias - Categorías activas`);
    console.log(`   GET    /api/dueno/categorias - Todas las categorías`);
    console.log(`   POST   /api/dueno/categorias - Crear categoría`);
    console.log(`   PUT    /api/dueno/categorias/:id - Editar categoría`);
    console.log(`   DELETE /api/dueno/categorias/:id - Eliminar categoría`);
    console.log(`=============================================\n`);
});
