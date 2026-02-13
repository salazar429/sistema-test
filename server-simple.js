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

// ========== RUTAS ==========

// RUTA RAÍZ
app.get('/', (req, res) => {
    const db = leerDB();
    res.json({
        mensaje: '✅ SERVIDOR CON JSON PERSISTENTE',
        timestamp: new Date().toISOString(),
        vendedoras: db.vendedoras.length,
        productos: db.productos.length
    });
});

// LOGIN VENDEDORA
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

// PRODUCTOS (vendedoras)
app.get('/api/productos', (req, res) => {
    const db = leerDB();
    res.json(db.productos);
});

// ========== RUTAS DUEÑO ==========

// OBTENER VENDEDORAS
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

// CREAR VENDEDORA
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

// ELIMINAR VENDEDORA
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

// PRODUCTOS (dueño)
app.get('/api/dueno/productos', (req, res) => {
    const db = leerDB();
    res.json(db.productos);
});

// ACTUALIZAR PRODUCTO
app.put('/api/dueno/productos/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, precio, stock } = req.body;
    const db = leerDB();
    
    const index = db.productos.findIndex(p => p.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    db.productos[index] = {
        ...db.productos[index],
        nombre: nombre || db.productos[index].nombre,
        precio: precio !== undefined ? parseFloat(precio) : db.productos[index].precio,
        stock: stock !== undefined ? parseInt(stock) : db.productos[index].stock
    };
    
    escribirDB(db);
    res.json({ success: true, producto: db.productos[index] });
});

// INICIAR SERVIDOR
app.listen(PORT, () => {
    console.log(`✅ Servidor JSON persistente en puerto ${PORT}`);
    console.log(`📁 Archivo: database.json`);
});
