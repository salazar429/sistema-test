const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ============ BASE DE DATOS EN MEMORIA ============
const Database = {
    // Vendedoras
    vendedoras: [
        {
            id: 'v_1',
            nombre: 'María González',
            usuario: 'maria_g',
            password: '123456',
            status: 'activa',
            tienda: 'Tienda Centro'
        },
        {
            id: 'v_2',
            nombre: 'Ana Rodríguez',
            usuario: 'ana_r',
            password: '123456',
            status: 'activa',
            tienda: 'Tienda Norte'
        }
    ],
    
    // Productos - SOLO UNO DE PRUEBA
    productos: [
        {
            id: 'p_1',
            nombre: 'PRODUCTO DE PRUEBA',
            categoria: 'prueba',
            precio: 99.99,
            stock: 100,
            minStock: 10,
            status: 'activo'
        }
    ],
    
    // Ventas
    ventas: []
};

// ============ RUTAS PÚBLICAS ============

// Ruta raíz - test
app.get('/', (req, res) => {
    res.json({
        mensaje: '✅ SERVIDOR FUNCIONANDO',
        timestamp: new Date().toISOString(),
        vendedoras: Database.vendedoras.length,
        productos: Database.productos.length,
        endpoints: {
            vendedoras: {
                login: 'POST /api/login',
                productos: 'GET /api/productos'
            },
            dueno: {
                vendedoras: 'GET/POST /api/dueno/vendedoras',
                productos: 'GET /api/dueno/productos'
            }
        }
    });
});

// ============ RUTAS PARA VENDEDORAS ============

// LOGIN - endpoint ÚNICO para vendedoras
app.post('/api/login', (req, res) => {
    console.log('📱 Login intento:', req.body);
    
    const { usuario, password } = req.body;
    
    if (!usuario || !password) {
        return res.status(400).json({ 
            success: false, 
            error: 'Usuario y contraseña requeridos' 
        });
    }
    
    const vendedora = Database.vendedoras.find(v => 
        v.usuario === usuario && 
        v.password === password && 
        v.status === 'activa'
    );
    
    if (vendedora) {
        console.log('✅ Login exitoso:', vendedora.nombre);
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
        console.log('❌ Login fallido:', usuario);
        res.status(401).json({
            success: false,
            error: 'Credenciales incorrectas'
        });
    }
});

// OBTENER PRODUCTOS - para vendedoras
app.get('/api/productos', (req, res) => {
    console.log('📦 Enviando productos a vendedora');
    res.json(Database.productos);
});

// ============ RUTAS PARA DUEÑO ============

// OBTENER TODAS LAS VENDEDORAS
app.get('/api/dueno/vendedoras', (req, res) => {
    console.log('👩‍💼 Enviando lista de vendedoras');
    const vendedorasSinPassword = Database.vendedoras.map(v => ({
        id: v.id,
        nombre: v.nombre,
        usuario: v.usuario,
        status: v.status,
        tienda: v.tienda
    }));
    res.json(vendedorasSinPassword);
});

// CREAR VENDEDORA
app.post('/api/dueno/vendedoras', (req, res) => {
    console.log('👩‍💼 Crear vendedora:', req.body);
    
    const { nombre, usuario, password, tienda } = req.body;
    
    // Validar
    if (!nombre || !usuario || !password) {
        return res.status(400).json({ 
            error: 'Nombre, usuario y contraseña son obligatorios' 
        });
    }
    
    // Verificar si ya existe
    const existe = Database.vendedoras.find(v => v.usuario === usuario);
    if (existe) {
        return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    const nuevaVendedora = {
        id: `v_${Date.now()}`,
        nombre,
        usuario,
        password,
        status: 'activa',
        tienda: tienda || 'Sin tienda'
    };
    
    Database.vendedoras.push(nuevaVendedora);
    console.log('✅ Vendedora creada:', nuevaVendedora.nombre);
    
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

// ACTUALIZAR VENDEDORA
app.put('/api/dueno/vendedoras/:id', (req, res) => {
    console.log('✏️ Actualizar vendedora:', req.params.id, req.body);
    
    const { id } = req.params;
    const { nombre, usuario, password, status, tienda } = req.body;
    
    const index = Database.vendedoras.findIndex(v => v.id === id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Vendedora no encontrada' });
    }
    
    // Verificar si el usuario ya existe (excepto ella misma)
    if (usuario) {
        const existe = Database.vendedoras.find(v => 
            v.usuario === usuario && v.id !== id
        );
        if (existe) {
            return res.status(400).json({ error: 'El nombre de usuario ya existe' });
        }
    }
    
    Database.vendedoras[index] = {
        ...Database.vendedoras[index],
        nombre: nombre || Database.vendedoras[index].nombre,
        usuario: usuario || Database.vendedoras[index].usuario,
        password: password || Database.vendedoras[index].password,
        status: status || Database.vendedoras[index].status,
        tienda: tienda || Database.vendedoras[index].tienda
    };
    
    res.json({
        success: true,
        vendedora: {
            id: Database.vendedoras[index].id,
            nombre: Database.vendedoras[index].nombre,
            usuario: Database.vendedoras[index].usuario,
            status: Database.vendedoras[index].status,
            tienda: Database.vendedoras[index].tienda
        }
    });
});

// ELIMINAR VENDEDORA
app.delete('/api/dueno/vendedoras/:id', (req, res) => {
    console.log('🗑️ Eliminar vendedora:', req.params.id);
    
    const { id } = req.params;
    const index = Database.vendedoras.findIndex(v => v.id === id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Vendedora no encontrada' });
    }
    
    Database.vendedoras.splice(index, 1);
    res.json({ success: true });
});

// OBTENER PRODUCTOS (para dueño)
app.get('/api/dueno/productos', (req, res) => {
    console.log('📦 Enviando productos al dueño');
    res.json(Database.productos);
});

// ACTUALIZAR PRODUCTO DE PRUEBA
app.put('/api/dueno/productos/:id', (req, res) => {
    console.log('✏️ Actualizar producto:', req.params.id, req.body);
    
    const { id } = req.params;
    const { nombre, precio, stock } = req.body;
    
    const index = Database.productos.findIndex(p => p.id === id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    Database.productos[index] = {
        ...Database.productos[index],
        nombre: nombre || Database.productos[index].nombre,
        precio: precio ? parseFloat(precio) : Database.productos[index].precio,
        stock: stock !== undefined ? parseInt(stock) : Database.productos[index].stock,
        status: parseInt(stock) <= Database.productos[index].minStock ? 'bajo stock' : 'activo'
    };
    
    console.log('✅ Producto actualizado:', Database.productos[index]);
    res.json({ success: true, producto: Database.productos[index] });
});

// ============ INICIAR SERVIDOR ============
app.listen(PORT, () => {
    console.log('\n🚀===========================================');
    console.log('✅ SERVIDOR SIMPLIFICADO INICIADO');
    console.log('=============================================');
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log('📅 Fecha:', new Date().toLocaleString());
    console.log('\n📊 DATOS DE PRUEBA:');
    console.log('   Vendedoras:');
    console.log('     - maria_g / 123456');
    console.log('     - ana_r / 123456');
    console.log('   Producto de prueba:');
    console.log('     - PRODUCTO DE PRUEBA - $99.99');
    console.log('\n📡 ENDPOINTS:');
    console.log('   GET  / - Estado del servidor');
    console.log('   POST /api/login - Login vendedoras');
    console.log('   GET  /api/productos - Productos vendedoras');
    console.log('   GET  /api/dueno/vendedoras - Lista vendedoras');
    console.log('   POST /api/dueno/vendedoras - Crear vendedora');
    console.log('   PUT  /api/dueno/vendedoras/:id - Actualizar');
    console.log('   DELETE /api/dueno/vendedoras/:id - Eliminar');
    console.log('   GET  /api/dueno/productos - Productos dueño');
    console.log('   PUT  /api/dueno/productos/:id - Actualizar producto');
    console.log('=============================================\n');
});