const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());

// ========== FUNCIONES JSON CON RESPALDO Y RECUPERACIÓN ==========
function leerDB() {
    try {
        // Si el archivo NO existe, crearlo con datos iniciales COMPLETOS
        if (!fs.existsSync(DB_FILE)) {
            console.log('📁 Creando nuevo archivo database.json con datos iniciales...');
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
        
        // Si el archivo existe, leerlo
        const data = fs.readFileSync(DB_FILE, 'utf8');
        
        // Verificar si el archivo está vacío o es inválido
        if (!data || data.trim() === '') {
            console.error('❌ Archivo database.json vacío, restaurando desde backup...');
            return restaurarDesdeBackup();
        }
        
        try {
            const db = JSON.parse(data);
            
            // Verificar que el objeto tenga la estructura correcta
            if (!db.categorias || !db.vendedoras || !db.productos || !db.ventas) {
                console.error('❌ Estructura de database.json inválida, restaurando...');
                return restaurarDesdeBackup();
            }
            
            console.log('📖 Base de datos leída correctamente');
            return db;
            
        } catch (parseError) {
            console.error('❌ Error parseando database.json:', parseError);
            return restaurarDesdeBackup();
        }
        
    } catch (error) {
        console.error('❌ Error crítico leyendo database.json:', error);
        return restaurarDesdeBackup();
    }
}

function restaurarDesdeBackup() {
    try {
        const backupFile = DB_FILE.replace('.json', '_backup.json');
        if (fs.existsSync(backupFile)) {
            console.log('🔄 Restaurando desde backup...');
            const backupData = fs.readFileSync(backupFile, 'utf8');
            const backup = JSON.parse(backupData);
            
            // Verificar que el backup sea válido
            if (backup.categorias && backup.vendedoras && backup.productos) {
                fs.writeFileSync(DB_FILE, backupData);
                console.log('✅ Backup restaurado correctamente');
                return backup;
            }
        }
    } catch (backupError) {
        console.error('❌ Error restaurando backup:', backupError);
    }
    
    // Si todo falla, crear desde cero
    console.log('⚠️ Creando base de datos desde cero...');
    const freshDB = {
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
                precio: 99.99, 
                stock: 100, 
                minStock: 10, 
                status: 'activo' 
            }
        ],
        ventas: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(freshDB, null, 2));
    console.log('✅ Base de datos creada desde cero');
    return freshDB;
}

function escribirDB(data) {
    try {
        // Siempre hacer backup ANTES de escribir
        if (fs.existsSync(DB_FILE)) {
            const backupFile = DB_FILE.replace('.json', '_backup.json');
            fs.copyFileSync(DB_FILE, backupFile);
            console.log('💾 Backup creado');
        }
        
        // Validar que los datos tengan la estructura correcta
        if (!data.categorias || !data.vendedoras || !data.productos || !data.ventas) {
            console.error('❌ Intento de guardar datos inválidos');
            return false;
        }
        
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        console.log('✅ Cambios guardados en database.json');
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
        productos: db.productos.length,
        archivo: 'database.json'
    });
});

// ========== RUTAS PARA CATEGORÍAS ==========

// 1. GET /api/categorias - Para vendedoras (solo activas)
app.get('/api/categorias', (req, res) => {
    console.log('📥 GET /api/categorias - Solicitado por vendedora');
    const db = leerDB();
    const categoriasActivas = db.categorias.filter(c => c.activa !== false);
    console.log(`📤 Enviando ${categoriasActivas.length} categorías activas`);
    res.json(categoriasActivas);
});

// 2. GET /api/dueno/categorias - Para dueño (todas)
app.get('/api/dueno/categorias', (req, res) => {
    console.log('📥 GET /api/dueno/categorias - Solicitado por dueño');
    const db = leerDB();
    console.log(`📤 Enviando ${db.categorias.length} categorías`);
    res.json(db.categorias);
});

// 3. POST /api/dueno/categorias - CREAR categoría
app.post('/api/dueno/categorias', (req, res) => {
    console.log('📥 POST /api/dueno/categorias - Crear categoría:', req.body);
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
    
    console.log('✅ Categoría creada:', nuevaCategoria);
    res.json({ success: true, categoria: nuevaCategoria });
});

// 4. PUT /api/dueno/categorias/:id - EDITAR categoría
app.put('/api/dueno/categorias/:id', (req, res) => {
    console.log('📥 PUT /api/dueno/categorias/:id - Actualizar:', req.params.id, req.body);
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
    console.log('✅ Categoría actualizada:', db.categorias[index]);
    res.json({ success: true, categoria: db.categorias[index] });
});

// 5. DELETE /api/dueno/categorias/:id - ELIMINAR categoría
app.delete('/api/dueno/categorias/:id', (req, res) => {
    console.log('📥 DELETE /api/dueno/categorias/:id - Eliminar:', req.params.id);
    const { id } = req.params;
    const db = leerDB();
    
    // Verificar si hay productos usando esta categoría
    const productosUsando = db.productos.filter(p => p.categoria === id);
    if (productosUsando.length > 0) {
        console.log('❌ No se puede eliminar: productos usándola:', productosUsando.map(p => p.nombre));
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
    
    console.log('✅ Categoría eliminada');
    res.json({ success: true });
});

// ========== RUTAS PARA VENDEDORAS ==========
app.post('/api/login', (req, res) => {
    console.log('📥 POST /api/login - Intento de login:', req.body.usuario);
    const { usuario, password } = req.body;
    const db = leerDB();
    
    const vendedora = db.vendedoras.find(v => 
        v.usuario === usuario && v.password === password && v.status === 'activa'
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
        res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
    }
});

app.get('/api/productos', (req, res) => {
    console.log('📥 GET /api/productos - Solicitado por vendedora');
    const db = leerDB();
    
    // Enriquecer productos con nombre de categoría
    const productosConCategoria = db.productos.map(p => {
        const categoria = db.categorias.find(c => c.id === p.categoria);
        return {
            ...p,
            categoria_nombre: categoria ? categoria.nombre : 'Sin categoría'
        };
    });
    
    console.log(`📤 Enviando ${productosConCategoria.length} productos`);
    res.json(productosConCategoria);
});

// ========== RUTAS PARA DUEÑO - VENDEDORAS ==========
app.get('/api/dueno/vendedoras', (req, res) => {
    console.log('📥 GET /api/dueno/vendedoras');
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
    console.log('📥 POST /api/dueno/vendedoras - Crear:', req.body);
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

app.delete('/api/dueno/vendedoras/:id', (req, res) => {
    console.log('📥 DELETE /api/dueno/vendedoras/:id - Eliminar:', req.params.id);
    const { id } = req.params;
    const db = leerDB();
    
    const index = db.vendedoras.findIndex(v => v.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Vendedora no encontrada' });
    }
    
    db.vendedoras.splice(index, 1);
    escribirDB(db);
    console.log('✅ Vendedora eliminada');
    res.json({ success: true });
});

// ========== RUTAS PARA DUEÑO - PRODUCTOS ==========
app.get('/api/dueno/productos', (req, res) => {
    console.log('📥 GET /api/dueno/productos');
    const db = leerDB();
    const productosConCategoria = db.productos.map(p => {
        const categoria = db.categorias.find(c => c.id === p.categoria);
        return {
            ...p,
            categoria_nombre: categoria ? categoria.nombre : 'Sin categoría'
        };
    });
    res.json(productosConCategoria);
});

app.post('/api/dueno/productos', (req, res) => {
    console.log('📥 POST /api/dueno/productos - Crear:', req.body);
    const { nombre, categoria, precio, stock, minStock } = req.body;
    const db = leerDB();
    
    if (!nombre || !precio || stock === undefined) {
        return res.status(400).json({ error: 'Nombre, precio y stock son obligatorios' });
    }
    
    // Si no se especifica categoría o no existe, usar null
    let categoriaId = null;
    if (categoria) {
        const categoriaValida = db.categorias.find(c => c.id === categoria);
        if (categoriaValida) {
            categoriaId = categoria;
        }
    }
    
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
    
    const categoriaNombre = categoriaId ? 
        (db.categorias.find(c => c.id === categoriaId)?.nombre || 'Sin categoría') : 
        'Sin categoría';
    
    console.log('✅ Producto creado:', nuevoProducto.nombre);
    res.json({
        success: true,
        producto: {
            ...nuevoProducto,
            categoria_nombre: categoriaNombre
        }
    });
});

app.put('/api/dueno/productos/:id', (req, res) => {
    console.log('📥 PUT /api/dueno/productos/:id - Actualizar:', req.params.id, req.body);
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
        categoria: categoria !== undefined ? categoria : db.productos[index].categoria,
        minStock: minStock !== undefined ? parseInt(minStock) : db.productos[index].minStock
    };
    
    db.productos[index].status = db.productos[index].stock <= db.productos[index].minStock 
        ? 'bajo stock' 
        : 'activo';
    
    escribirDB(db);
    
    const categoriaNombre = db.productos[index].categoria ? 
        (db.categorias.find(c => c.id === db.productos[index].categoria)?.nombre || 'Sin categoría') : 
        'Sin categoría';
    
    console.log('✅ Producto actualizado:', db.productos[index].nombre);
    res.json({ 
        success: true, 
        producto: {
            ...db.productos[index],
            categoria_nombre: categoriaNombre
        }
    });
});

app.delete('/api/dueno/productos/:id', (req, res) => {
    console.log('📥 DELETE /api/dueno/productos/:id - Eliminar:', req.params.id);
    const { id } = req.params;
    const db = leerDB();
    
    const index = db.productos.findIndex(p => p.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    db.productos.splice(index, 1);
    escribirDB(db);
    
    console.log('✅ Producto eliminado');
    res.json({ success: true });
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, () => {
    console.log(`\n🚀===========================================`);
    console.log(`✅ SERVIDOR CON PERSISTENCIA REAL`);
    console.log(`=============================================`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`📁 Archivo: ${DB_FILE}`);
    console.log(`💾 Backup automático: database_backup.json`);
    console.log(`\n📦 DATOS INICIALES (solo si no existe archivo):`);
    console.log(`   - 6 categorías predefinidas`);
    console.log(`   - 2 vendedoras de prueba`);
    console.log(`   - 1 producto de prueba`);
    console.log(`=============================================\n`);
});
