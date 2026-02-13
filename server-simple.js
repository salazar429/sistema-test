const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());

// ========== FUNCIONES JSON ==========
function leerDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initialDB = {
                vendedoras: [
                    { id: 'v_1', nombre: 'María González', usuario: 'maria_g', password: '123456', status: 'activa', tienda: 'Tienda Centro' },
                    { id: 'v_2', nombre: 'Ana Rodríguez', usuario: 'ana_r', password: '123456', status: 'activa', tienda: 'Tienda Norte' }
                ],
                productos: [
                    { id: 'p_1', nombre: 'PRODUCTO DE PRUEBA', categoria: 'prueba', precio: 99.99, stock: 100, minStock: 10, status: 'activo' }
                ],
                ventas: []
            };
            fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2));
            return initialDB;
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (error) {
        return { vendedoras: [], productos: [], ventas: [] };
    }
}

function escribirDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ========== RUTAS PÚBLICAS ==========
app.get('/', (req, res) => {
    const db = leerDB();
    res.json({
        mensaje: '✅ SERVIDOR CON JSON PERSISTENTE',
        timestamp: new Date().toISOString(),
        vendedoras: db.vendedoras.length,
        productos: db.productos.length
    });
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
    res.json(db.productos);
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

// 1. OBTENER TODOS LOS PRODUCTOS
app.get('/api/dueno/productos', (req, res) => {
    const db = leerDB();
    res.json(db.productos);
});

// 2. CREAR NUEVO PRODUCTO (⚠️ ESTA ES LA QUE FALTABA ⚠️)
app.post('/api/dueno/productos', (req, res) => {
    console.log('📦 Creando nuevo producto:', req.body);
    
    const { nombre, categoria, precio, stock, minStock } = req.body;
    const db = leerDB();
    
    // Validaciones básicas
    if (!nombre || !precio || stock === undefined) {
        return res.status(400).json({ 
            error: 'Nombre, precio y stock son obligatorios' 
        });
    }
    
    // Crear nuevo producto con ID único
    const nuevoProducto = {
        id: `p_${Date.now()}`,
        nombre: nombre,
        categoria: categoria || 'general',
        precio: parseFloat(precio),
        stock: parseInt(stock),
        minStock: parseInt(minStock) || 5,
        status: parseInt(stock) > (parseInt(minStock) || 5) ? 'activo' : 'bajo stock'
    };
    
    db.productos.push(nuevoProducto);
    escribirDB(db);
    
    console.log('✅ Producto creado:', nuevoProducto);
    
    res.json({
        success: true,
        producto: nuevoProducto
    });
});

// 3. ACTUALIZAR PRODUCTO
app.put('/api/dueno/productos/:id', (req, res) => {
    console.log('✏️ Actualizando producto:', req.params.id, req.body);
    
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
    
    // Actualizar estado según stock
    db.productos[index].status = db.productos[index].stock <= db.productos[index].minStock 
        ? 'bajo stock' 
        : 'activo';
    
    escribirDB(db);
    console.log('✅ Producto actualizado:', db.productos[index]);
    
    res.json({ 
        success: true, 
        producto: db.productos[index] 
    });
});

// 4. ELIMINAR PRODUCTO (OPCIONAL - POR SI LO NECESITAS)
app.delete('/api/dueno/productos/:id', (req, res) => {
    console.log('🗑️ Eliminando producto:', req.params.id);
    
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
    console.log(`✅ Servidor JSON persistente en puerto ${PORT}`);
    console.log(`📁 Archivo: database.json`);
    console.log(`\n📦 ENDPOINTS DE PRODUCTOS:`);
    console.log(`   GET    /api/dueno/productos - Listar productos`);
    console.log(`   POST   /api/dueno/productos - Crear producto (⚠️ NUEVO)`);
    console.log(`   PUT    /api/dueno/productos/:id - Actualizar producto`);
    console.log(`   DELETE /api/dueno/productos/:id - Eliminar producto`);
});
