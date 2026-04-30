// ========== CONFIGURACIÓN DE SUPABASE (CREDENCIALES CORREGIDAS) ==========
const SUPABASE_URL = "https://xkqejmzsahmdnhnpctem.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrcWVqbXpzYWhtZG5obnBjdGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTM2MjgsImV4cCI6MjA5MjM2OTYyOH0.RKKlgWqyst5XIrDwhMx8yXcBd4K90BbxIarsZlCP07w";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== ESTADO CENTRAL ==========
const App = {
    articulos: [],
    carrito: [],
    seleccionados: {},
    ventas: JSON.parse(localStorage.getItem('family_ventas')) || [],
    pendientes: JSON.parse(localStorage.getItem('family_pendientes')) || [],
    isPanel: window.location.pathname.includes('panel.html'),
    filtroPanel: ""
};

const LIMITE = 200;

// ========== UTILIDADES ==========
function guardarLocal() {
    localStorage.setItem('family_articulos', JSON.stringify(App.articulos));
    localStorage.setItem('family_ventas', JSON.stringify(App.ventas));
    localStorage.setItem('family_pendientes', JSON.stringify(App.pendientes));
}

// ========== SYNCRONIZACIÓN CON SUPABASE ==========
async function sync() {
    if (!navigator.onLine || App.pendientes.length === 0) return;
    
    console.log('🔄 Sincronizando', App.pendientes.length, 'cambios pendientes...');
    
    const copia = [...App.pendientes];
    
    for (const cambio of copia) {
        try {
            if (cambio.tipo === "insert") {
                const { error } = await db.from("productos").insert(cambio.datos);
                if (!error) {
                    App.pendientes = App.pendientes.filter(p => p !== cambio);
                    console.log('✅ Insertado:', cambio.datos.nombre);
                } else {
                    console.error('❌ Error insert:', error);
                }
            }
            if (cambio.tipo === "update") {
                const { error } = await db.from("productos").update(cambio.datos).eq("id", cambio.id);
                if (!error) {
                    App.pendientes = App.pendientes.filter(p => p !== cambio);
                    console.log('✅ Actualizado ID:', cambio.id);
                } else {
                    console.error('❌ Error update:', error);
                }
            }
            if (cambio.tipo === "delete") {
                const { error } = await db.from("productos").delete().eq("id", cambio.id);
                if (!error) {
                    App.pendientes = App.pendientes.filter(p => p !== cambio);
                    console.log('✅ Eliminado ID:', cambio.id);
                } else {
                    console.error('❌ Error delete:', error);
                }
            }
        } catch (err) {
            console.error('❌ Error sync:', err);
        }
    }
    
    guardarLocal();
    await sincronizarVentasPendientes();
}

// ========== SINCRONIZAR VENTAS A SUPABASE ==========
async function sincronizarVentasPendientes() {
    const ventasSync = JSON.parse(localStorage.getItem('family_ventas_sync') || '[]');
    if (ventasSync.length === 0) return;
    
    console.log('💰 Sincronizando', ventasSync.length, 'ventas pendientes...');
    
    const copia = [...ventasSync];
    
    for (const venta of copia) {
        try {
            const { error } = await db.from("ventas").insert({
                fecha: venta.fecha,
                total: venta.total,
                items: venta.items || [],
                resumen: venta.detalle || ''
            });
            
            if (!error) {
                const idx = ventasSync.indexOf(venta);
                if (idx >= 0) ventasSync.splice(idx, 1);
                console.log('✅ Venta sincronizada: $' + venta.total);
            } else {
                console.error('❌ Error venta:', error);
            }
        } catch (e) {
            console.error('❌ Error sync venta:', e);
        }
    }
    
    localStorage.setItem('family_ventas_sync', JSON.stringify(ventasSync));
}

// ========== CARGA INICIAL ==========
async function init() {
    console.log('🧾 La Family Market - Iniciando...');
    
    if (navigator.onLine) {
        const { data, error } = await db.from("productos").select("*").order('id', { ascending: true });
        if (data && !error) {
            App.articulos = data;
            guardarLocal();
            console.log('✅ Cargados', data.length, 'productos desde Supabase');
        } else {
            console.log('⚠️ Usando datos locales');
            const local = localStorage.getItem("family_articulos");
            if (local) App.articulos = JSON.parse(local);
        }
    } else {
        const local = localStorage.getItem("family_articulos");
        if (local) App.articulos = JSON.parse(local);
    }
    
    if (App.articulos.length === 0) {
    App.articulos = [];
    guardarLocal();
    console.log('📦 Sin productos de ejemplo. Listo para pegar la Lista Rápida.');
}

    if (App.isPanel) {
        renderPanel();
        setTimeout(() => {
            if (typeof actualizarStockPanel === 'function') actualizarStockPanel();
        }, 500);
    } else {
        renderTab("vender");
    }
    
    console.log('✅ App lista. Productos:', App.articulos.length);
}

// ========== POS ==========
window.cambiarTab = (tab, btn) => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    renderTab(tab);
};

function renderTab(tab) {
    const cont = document.getElementById("contenidoDinamico");
    if (!cont) return;

    if (tab === "vender") {
        const stockBajo = App.articulos.filter(a => a.stock <= 5 && a.stock > 0 && !a.agotado);
        const agotados = App.articulos.filter(a => a.stock <= 0 || a.agotado);

        let alertaHTML = '';
        if (stockBajo.length > 0 || agotados.length > 0) {
            alertaHTML = `<div class="stock-alert-banner" onclick="mostrarStockBajo()">
                <span class="icono">⚠️</span>
                <span>${stockBajo.length > 0 ? `<strong>${stockBajo.length}</strong> productos con stock bajo` : ''}${stockBajo.length > 0 && agotados.length > 0 ? ' y ' : ''}${agotados.length > 0 ? `<strong>${agotados.length}</strong> agotados` : ''}</span>
                <span class="stock-alert-count">${stockBajo.length + agotados.length}</span>
            </div>`;
        }

        cont.innerHTML = `
            ${alertaHTML}
            <div class="search-box"><input id="buscador" placeholder="Buscar producto..." oninput="filtrar()"></div>
            <div id="grid" class="articulos-grid"></div>
        `;
        renderArticulos();
        updateFloat();
    }

    if (tab === "caja") {
        const total = App.ventas.reduce((s, v) => s + v.total, 0);
        cont.innerHTML = `
            <div style="padding:20px">
                <h2 style="color:#f1c40f;">💰 Caja del día</h2>
                <div style="background:#1e293b;padding:16px;border-radius:16px;margin-bottom:16px;">
                    <p style="color:#94a3b8;">Ventas realizadas</p><h3>${App.ventas.length}</h3>
                    <p style="color:#94a3b8;margin-top:10px;">Total generado</p><h2 style="color:#25D366;">$${total.toLocaleString()}</h2>
                </div>
                <button class="btn-cobrar-pro" onclick="cerrarCaja()">🔒 CERRAR CAJA</button>
            </div>`;
    }

    if (tab === "informes") {
        cont.innerHTML = `
            <div style="padding:16px;">
                <h2 style="color:#f1c40f;margin-bottom:16px;">📊 Informes</h2>
                <div id="informesContent">
                    <p style="color:#94a3b8;text-align:center;">Cargando informes...</p>
                </div>
            </div>`;
        cargarInformes();
    }
}

// ========== RENDER PRODUCTOS CON NUMERACIÓN Y BADGE STOCK BAJO ==========
function renderArticulos(filtro = "") {
    const grid = document.getElementById("grid");
    if (!grid) return;
    const lista = App.articulos.filter(a => !a.agotado && a.nombre.toLowerCase().includes(filtro.toLowerCase()));

    if (lista.length === 0) {
        grid.innerHTML = '<p style="color:#94a3b8;text-align:center;grid-column:1/-1;padding:40px;">📦 Sin productos</p>';
        return;
    }

    grid.innerHTML = lista.map((a, index) => {
        const numeroReal = index + 1;
        const seleccionado = App.seleccionados[a.id] ? 'seleccionado' : '';
        const stockBajo = a.stock <= 5 ? '<span class="stock-badge">¡BAJO!</span>' : '';
        return `
        <div class="articulo-card ${seleccionado}" onclick="add(${a.id})">
            <div class="producto-numero">#${numeroReal}</div>
            <div class="articulo-nombre">${a.nombre}${stockBajo}</div>
            <div class="articulo-precio">$${a.precio.toLocaleString()}</div>
            <div class="articulo-stock">📦 ${a.stock}</div>
        </div>`;
    }).join("");
}

window.filtrar = () => renderArticulos(document.getElementById("buscador")?.value || "");

window.add = (id) => {
    const art = App.articulos.find(a => a.id == id);
    if (!art) return;
    if (!App.seleccionados[id]) App.seleccionados[id] = { cantidad: 0 };
    if (App.seleccionados[id].cantidad >= art.stock) { alert("Sin stock disponible"); return; }
    App.seleccionados[id].cantidad++;
    updateFloat();
    renderArticulos(document.getElementById("buscador")?.value || "");
};

// ========== MOSTRAR STOCK BAJO ==========
window.mostrarStockBajo = () => {
    const stockBajo = App.articulos.filter(a => a.stock <= 5 && a.stock > 0 && !a.agotado);
    const agotados = App.articulos.filter(a => a.stock <= 0 || a.agotado);

    if (stockBajo.length === 0 && agotados.length === 0) {
        alert("✅ Todos los productos tienen stock suficiente.");
        return;
    }

    let mensaje = '';
    if (agotados.length > 0) {
        mensaje += '🔴 AGOTADOS:\n';
        mensaje += agotados.map(a => `  • ${a.nombre}`).join('\n');
        mensaje += '\n\n';
    }
    if (stockBajo.length > 0) {
        mensaje += '🟡 STOCK BAJO (5 o menos):\n';
        mensaje += stockBajo.map(a => `  • ${a.nombre} (Quedan: ${a.stock})`).join('\n');
    }
    mensaje += '\n\n📦 Ve al Panel del Jefe para actualizar el inventario.';
    alert(mensaje);
};

// ========== BARRA FLOTANTE ==========
function updateFloat() {
    const f = document.getElementById("accionesFlotantes");
    const t = document.getElementById("totalSeleccionado");
    if (!f || !t) return;

    const ids = Object.keys(App.seleccionados);
    if (ids.length === 0) {
        f.classList.add("hidden");
        return;
    }

    const total = ids.reduce((s, id) => s + (App.articulos.find(x => x.id == id)?.precio || 0) * App.seleccionados[id].cantidad, 0);
    const totalItems = ids.reduce((s, id) => s + (App.seleccionados[id]?.cantidad || 0), 0);

    t.innerHTML = `<span class="flotante-badge">${totalItems}</span> $${total.toLocaleString()}`;
    f.classList.remove("hidden");
}

// ========== CHECKOUT ==========
window.verCarrito = () => {
    App.carrito = Object.entries(App.seleccionados).map(([id, v]) => ({ ...App.articulos.find(x => x.id == id), cantidad: v.cantidad }));
    App.seleccionados = {};
    renderCheckout();
};

function renderCheckout() {
    const cont = document.getElementById("contenidoDinamico");
    const total = App.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);

    cont.innerHTML = `
        <div class="checkout-container">
            <div class="checkout-header">🛒 Checkout</div>
            ${App.carrito.map(item => `
                <div class="checkout-item">
                    <div class="checkout-item-info">
                        <div class="checkout-item-nombre">${item.nombre}</div>
                        <div class="checkout-item-precio">$${item.precio.toLocaleString()} c/u</div>
                    </div>
                    <div class="checkout-item-controles">
                        <button class="checkout-btn checkout-btn-menos" onclick="modificarItem(${item.id}, -1)">−</button>
                        <span class="checkout-cantidad">${item.cantidad}</span>
                        <button class="checkout-btn checkout-btn-mas" onclick="modificarItem(${item.id}, 1)">+</button>
                    </div>
                    <span class="checkout-item-total">$${(item.precio * item.cantidad).toLocaleString()}</span>
                </div>
            `).join('')}
            <div class="checkout-total-box">
                <p style="color:#94a3b8;">Total a cobrar</p>
                <h2>$${total.toLocaleString()}</h2>
            </div>
            <button class="btn-cobrar-pro" onclick="finalizarVenta()">💰 COBRAR AHORA</button>
            <button style="width:100%;margin-top:10px;padding:14px;border-radius:50px;border:2px solid #f1c40f;background:transparent;color:#f1c40f;font-weight:bold;cursor:pointer;" onclick="cancelarCheckout()">← Volver a productos</button>
        </div>`;
    document.getElementById("accionesFlotantes").classList.add("hidden");
}

// ========== MODIFICAR CANTIDAD EN CHECKOUT ==========
window.modificarItem = (id, delta) => {
    const item = App.carrito.find(i => i.id == id);
    if (!item) return;

    const art = App.articulos.find(a => a.id == id);
    const nueva = item.cantidad + delta;

    if (nueva <= 0) {
        if (!App.seleccionados[id]) App.seleccionados[id] = { cantidad: 0 };
        App.seleccionados[id].cantidad += item.cantidad;
        App.carrito = App.carrito.filter(i => i.id != id);
        if (App.carrito.length === 0) {
            renderTab("vender");
            updateFloat();
            return;
        }
    } else if (nueva > art.stock) {
        alert(`Solo hay ${art.stock} disponibles`);
        return;
    } else {
        item.cantidad = nueva;
    }
    renderCheckout();
};

window.cancelarCheckout = () => {
    App.carrito.forEach(i => {
        if (!App.seleccionados[i.id]) App.seleccionados[i.id] = { cantidad: 0 };
        App.seleccionados[i.id].cantidad += i.cantidad;
    });
    App.carrito = [];
    renderTab("vender");
    updateFloat();
};

// ========== FINALIZAR VENTA (MODIFICADA PARA EL DUEÑO) ==========
window.finalizarVenta = () => {
    if (App.carrito.length === 0) return;

    const resumenProductos = App.carrito.map(i => `${i.nombre} (${i.cantidad})`).join(", ");

    const itemsVenta = App.carrito.map(i => ({
        id: i.id,
        nombre: i.nombre,
        precio: i.precio,
        cantidad: i.cantidad
    }));

    App.carrito.forEach(i => {
        const art = App.articulos.find(a => a.id == i.id);
        if (art) { 
            art.stock -= i.cantidad; 
            App.pendientes.push({ tipo: "update", id: art.id, datos: { ...art } }); 
        }
    });

    const total = App.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    
    const venta = { 
        fecha: new Date().toISOString(), 
        total, 
        items: itemsVenta,
        detalle: resumenProductos
    };
    
    App.ventas.push(venta);
    guardarLocal();

    const historialGlobal = JSON.parse(localStorage.getItem('family_historial_global') || '[]');
    historialGlobal.push(venta);
    localStorage.setItem('family_historial_global', JSON.stringify(historialGlobal));

    const ventasSync = JSON.parse(localStorage.getItem('family_ventas_sync') || '[]');
    ventasSync.push(venta);
    localStorage.setItem('family_ventas_sync', JSON.stringify(ventasSync));

    if (navigator.onLine) {
        db.from("ventas").insert({
            fecha: venta.fecha,
            total: total,
            items: itemsVenta,
            resumen: resumenProductos
        }).then(({ error }) => {
            if (!error) {
                const vs = JSON.parse(localStorage.getItem('family_ventas_sync') || '[]');
                const idx = vs.findIndex(v => v.fecha === venta.fecha);
                if (idx >= 0) vs.splice(idx, 1);
                localStorage.setItem('family_ventas_sync', JSON.stringify(vs));
            }
        });
    }

    alert(`✅ Venta registrada!\n${resumenProductos}\nTotal: $${total.toLocaleString()}`);
    App.carrito = [];
    renderTab("vender");
    if (navigator.onLine) sync();
};

// ========== CERRAR CAJA ==========
window.cerrarCaja = () => {
    if (App.ventas.length === 0) { alert("Sin ventas hoy"); return; }
    
    const total = App.ventas.reduce((s, v) => s + v.total, 0);
    const cantidad = App.ventas.length;
    const hoy = new Date().toISOString().split("T")[0];
    
    const cierres = JSON.parse(localStorage.getItem('family_cierres') || '[]');
    cierres.push({ fecha: hoy, total, ventas: cantidad });
    localStorage.setItem('family_cierres', JSON.stringify(cierres));
    
    if (navigator.onLine) {
        db.from("cierres").upsert({ 
            fecha: hoy, 
            total, 
            cantidad_ventas: cantidad 
        }).then(() => {
            console.log('✅ Cierre guardado en Supabase');
        }).catch(err => console.error('❌ Error cierre:', err));
    }
    
    App.ventas = [];
    guardarLocal();
    alert(`🔒 Caja cerrada. Total: $${total.toLocaleString()}`);
    renderTab("caja");
};

// ========== INFORMES (MODIFICADA PARA MOSTRAR DETALLE) ==========
async function cargarInformes() {
    const cont = document.getElementById("informesContent");
    if (!cont) return;

    const historialGlobal = JSON.parse(localStorage.getItem('family_historial_global') || '[]');
    const cierresLocal = JSON.parse(localStorage.getItem('family_cierres') || '[]');

    let html = '';

    html += `<div class="informe-card"><h3 class="informe-titulo">📊 DESGLOSE DE VENTAS HOY</h3>`;
    if (App.ventas.length === 0) {
        html += `<p style="color:#94a3b8;text-align:center;">Aún no hay ventas hoy</p>`;
    } else {
        App.ventas.slice().reverse().forEach((v, i) => {
            const fecha = new Date(v.fecha);
            html += `
                <div style="border-bottom:1px solid #334155; padding: 10px 0;">
                    <div class="informe-row">
                        <span>Venta ${App.ventas.length - i} (${fecha.toLocaleTimeString()})</span>
                        <span style="color:#25D366;font-weight:bold;">$${v.total.toLocaleString()}</span>
                    </div>
                    <div style="color:#94a3b8; font-size: 0.85em; margin-top: 4px;">
                        📦 ${v.detalle || 'Sin detalle'}
                    </div>
                </div>`;
        });
        const totalHoy = App.ventas.reduce((s, v) => s + v.total, 0);
        html += `<div class="informe-row" style="border-top:2px solid #f1c40f;margin-top:8px;padding-top:8px;"><strong>TOTAL HOY</strong><strong style="color:#25D366;">$${totalHoy.toLocaleString()}</strong></div>`;
    }
    html += `</div>`;

    html += `<div class="informe-card"><h3 class="informe-titulo">📅 COMPARATIVA DE DÍAS</h3>`;
    if (cierresLocal.length === 0) {
        html += `<p style="color:#94a3b8;text-align:center;">No hay cierres anteriores</p>`;
    } else {
        cierresLocal.slice(-7).reverse().forEach(c => {
            const ff = new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
            html += `<div class="informe-row"><span>${ff}</span><span style="color:#25D366;font-weight:bold;">$${c.total.toLocaleString()} (${c.ventas} ventas)</span></div>`;
        });
    }
    html += `</div>`;

    html += `<div class="informe-card"><h3 class="informe-titulo">🌍 ÚLTIMAS VENTAS</h3>`;
    if (historialGlobal.length === 0) {
        html += `<p style="color:#94a3b8;text-align:center;">No hay ventas registradas</p>`;
    } else {
        historialGlobal.slice(-10).reverse().forEach(v => {
            const f = new Date(v.fecha);
            html += `
                <div style="border-bottom:1px solid #334155; padding: 8px 0;">
                    <div class="informe-row">
                        <span>${f.toLocaleDateString()} ${f.toLocaleTimeString()}</span>
                        <span style="color:#25D366;font-weight:bold;">$${v.total.toLocaleString()}</span>
                    </div>
                    <div style="color:#94a3b8; font-size: 0.85em; margin-top: 2px;">
                        📦 ${v.detalle || 'Sin detalle'}
                    </div>
                </div>`;
        });
    }
    html += `</div>`;

    if (navigator.onLine) {
        try {
            const { data: ventasDB } = await db.from("ventas").select("*").order("fecha", { ascending: false }).limit(10);
            if (ventasDB && ventasDB.length > 0) {
                html += `<div class="informe-card"><h3 class="informe-titulo">☁️ REGISTROS EN LA NUBE</h3>`;
                ventasDB.forEach(v => {
                    const f = new Date(v.fecha || v.created_at);
                    html += `
                        <div style="border-bottom:1px solid #334155; padding: 8px 0;">
                            <div class="informe-row">
                                <span>${f.toLocaleDateString()} ${f.toLocaleTimeString()}</span>
                                <span style="color:#25D366;font-weight:bold;">$${v.total.toLocaleString()}</span>
                            </div>
                            <div style="color:#94a3b8; font-size: 0.85em; margin-top: 2px;">
                                📦 ${v.resumen || v.detalle || 'Sin detalle'}
                            </div>
                        </div>`;
                });
                html += `</div>`;
            }
        } catch (e) {
            console.error('Error cargando ventas de Supabase:', e);
        }
    }

    cont.innerHTML = html;
}

// ========== PANEL DEL JEFE ==========
function renderPanel() {
    document.getElementById("btnModoRapido")?.addEventListener("click", abrirModoRapido);
    document.getElementById("btnProcesarRapido")?.addEventListener("click", procesarListaRapida);
    document.getElementById("btnCancelarRapido")?.addEventListener("click", cerrarModoRapido);
    document.getElementById("btnBorrarTodo")?.addEventListener("click", borrarTodo);
    document.getElementById("btnGuardarProducto")?.addEventListener("click", agregarProducto);
    document.getElementById("buscadorPanel")?.addEventListener("input", filtrarPanel);

    renderTablaPanel();
    actualizarContador();
    cargarStats();
    
    setTimeout(() => {
        if (typeof actualizarStockPanel === 'function') actualizarStockPanel();
    }, 1000);
}

function filtrarPanel() {
    App.filtroPanel = document.getElementById("buscadorPanel")?.value?.toLowerCase() || "";
    renderTablaPanel();
}

function renderTablaPanel() {
    const tbody = document.getElementById("tablaProductosBody");
    if (!tbody) return;
    const lista = App.filtroPanel ? App.articulos.filter(a => a.nombre.toLowerCase().includes(App.filtroPanel)) : App.articulos;
    tbody.innerHTML = lista.map((p, i) => {
        const stockClass = (p.stock || 0) <= 5 && (p.stock || 0) > 0 && !p.agotado ? 'fila-stock-bajo' : '';
        const badgeBajo = (p.stock || 0) <= 5 && (p.stock || 0) > 0 && !p.agotado ? 
            `<span class="badge-stock-bajo">¡${p.stock}!</span>` : '';
        const costo = p.costo || 0;
        const ganancia = p.precio - costo;
        const gananciaColor = ganancia > 0 ? 'color:#25D366;' : ganancia < 0 ? 'color:#ef4444;' : 'color:#94a3b8;';
        
        return `
        <tr class="${p.agotado ? 'fila-agotada' : ''} ${stockClass}">
            <td>${i + 1}</td>
            <td><input type="text" value="${p.nombre}" onchange="updateCampo(${p.id},'nombre',this.value)" class="${p.agotado?'texto-tachado':''}">${badgeBajo}</td>
            <td><input type="number" value="${costo}" onchange="updateCampo(${p.id},'costo',parseInt(this.value))" style="width:80px;"></td>
            <td><input type="number" value="${p.precio}" onchange="updateCampo(${p.id},'precio',parseInt(this.value))" style="width:80px;"></td>
            <td style="${gananciaColor} font-weight:bold;">$${ganancia.toLocaleString()}</td>
            <td><input type="number" value="${p.stock}" onchange="updateCampo(${p.id},'stock',parseInt(this.value))" style="width:70px;"></td>
            <td><input type="checkbox" ${p.agotado?'checked':''} onchange="toggleAgotado(${p.id},this.checked)"></td>
            <td><button onclick="eliminarProducto(${p.id})">🗑️</button></td>
        </tr>`;
    }).join("");
    actualizarContador();
    
    setTimeout(() => {
        if (typeof actualizarStockPanel === 'function') actualizarStockPanel();
    }, 300);
}

window.updateCampo = (id, campo, valor) => {
    const p = App.articulos.find(a => a.id == id);
    if (p) { 
        p[campo] = valor; 
        App.pendientes.push({ tipo: "update", id, datos: { ...p } }); 
        guardarLocal(); 
        sync(); 
        if (typeof actualizarStockPanel === 'function') actualizarStockPanel();
    }
};

window.toggleAgotado = (id, checked) => {
    const p = App.articulos.find(a => a.id == id);
    if (p) { 
        p.agotado = checked; 
        App.pendientes.push({ tipo: "update", id, datos: { ...p } }); 
        guardarLocal(); 
        renderTablaPanel(); 
        sync(); 
        if (typeof actualizarStockPanel === 'function') actualizarStockPanel();
    }
};

window.eliminarProducto = (id) => {
    if (!confirm("¿Eliminar este producto?")) return;
    App.articulos = App.articulos.filter(a => a.id != id);
    App.pendientes.push({ tipo: "delete", id });
    guardarLocal();
    renderTablaPanel();
    sync();
    if (typeof actualizarStockPanel === 'function') actualizarStockPanel();
};

window.agregarProducto = () => {
    if (App.articulos.length >= LIMITE) { alert("Límite alcanzado (200 productos)"); return; }
    const n = document.getElementById("nuevoNombre")?.value?.trim();
    const c = parseInt(document.getElementById("nuevoCosto")?.value) || 0;
    const p = parseInt(document.getElementById("nuevoPrecio")?.value);
    const s = parseInt(document.getElementById("nuevoStock")?.value);
    if (!n || isNaN(p) || isNaN(s)) { alert("Completa todos los campos"); return; }
    const nuevo = { id: Date.now(), nombre: n, precio: p, stock: s, costo: c, agotado: false, stock_minimo: 5 };
    App.articulos.push(nuevo);
    App.pendientes.push({ tipo: "insert", datos: nuevo });
    guardarLocal();
    document.getElementById("nuevoNombre").value = "";
    document.getElementById("nuevoCosto").value = "";
    document.getElementById("nuevoPrecio").value = "";
    document.getElementById("nuevoStock").value = "";
    renderTablaPanel();
    sync();
    if (typeof actualizarStockPanel === 'function') actualizarStockPanel();
};

function actualizarContador() {
    const c = document.getElementById("contadorProductos");
    if (c) c.textContent = App.filtroPanel ?
        `${App.articulos.filter(a => a.nombre.toLowerCase().includes(App.filtroPanel)).length} encontrados / ${App.articulos.length} totales` :
        `${App.articulos.length} / ${LIMITE} productos`;
}

// ========== MODO RÁPIDO ==========
function abrirModoRapido() {
    document.getElementById("modoRapidoModal")?.classList.remove("hidden");
    document.getElementById("listaRapida").value = "";
}

function cerrarModoRapido() {
    document.getElementById("modoRapidoModal")?.classList.add("hidden");
}

function procesarListaRapida() {
    const texto = document.getElementById("listaRapida")?.value || "";
    const lineas = texto.split(/\r?\n/);
    let agregados = 0, duplicados = 0;

    for (const linea of lineas) {
        if (!linea.trim()) continue;
        const nums = linea.match(/\d+/g);
        if (!nums || nums.length < 2) continue;
        
        // Ahora lee 3 números: costo, precio, stock
        const costo = nums.length >= 3 ? parseInt(nums[nums.length - 3]) : 0;
        const precio = parseInt(nums[nums.length - 2]);
        const stock = parseInt(nums[nums.length - 1]);
        
        let nombre = linea.trim();
        // Quitar los números del final del nombre
        nombre = nombre.replace(new RegExp(`\\s*${stock}\\s*$`), '')
                       .replace(new RegExp(`\\s*${precio}\\s*$`), '')
                       .replace(new RegExp(`\\s*${costo}\\s*$`), '')
                       .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '').trim();
        
        if (!nombre || precio <= 0 || stock <= 0) continue;
        if (App.articulos.length >= LIMITE) break;
        if (App.articulos.some(a => a.nombre.toLowerCase() === nombre.toLowerCase())) { duplicados++; continue; }

        const nuevo = { id: Date.now() + agregados, nombre, precio, stock, costo, agotado: false, stock_minimo: 5 };
        App.articulos.push(nuevo);
        App.pendientes.push({ tipo: "insert", datos: nuevo });
        agregados++;
    }

    guardarLocal();
    renderTablaPanel();
    cargarStats();
    alert(`✅ ${agregados} agregados. ${duplicados > 0 ? '⚠️ ' + duplicados + ' duplicados.' : ''}`);
    cerrarModoRapido();
    sync();
    if (typeof actualizarStockPanel === 'function') actualizarStockPanel();
}

function borrarTodo() {
    if (!confirm("¿Borrar TODOS los productos? Esto no se puede deshacer.")) return;
    App.articulos = [];
    App.pendientes = [];
    guardarLocal();
    renderTablaPanel();
    cargarStats();
    sync();
    if (typeof actualizarStockPanel === 'function') actualizarStockPanel();
}

// ========== ESTADÍSTICAS DEL PANEL ==========
async function cargarStats() {
    if (!navigator.onLine) return;
    try {
        const hoy = new Date().toISOString().split('T')[0];
        const semana = new Date(Date.now() - 7*86400000).toISOString().split('T')[0];
        const mes = new Date(Date.now() - 30*86400000).toISOString().split('T')[0];

        const { data: gHoy } = await db.rpc('calcular_ganancias', { fecha_inicio: hoy, fecha_fin: hoy });
        document.getElementById('gananciaHoy').textContent = '$' + (gHoy?.[0]?.ganancia_neta || 0).toLocaleString();

        const { data: gSemana } = await db.rpc('calcular_ganancias', { fecha_inicio: semana, fecha_fin: hoy });
        document.getElementById('gananciaSemana').textContent = '$' + (gSemana?.[0]?.ganancia_neta || 0).toLocaleString();

        const { data: gMes } = await db.rpc('calcular_ganancias', { fecha_inicio: mes, fecha_fin: hoy });
        document.getElementById('gananciaMes').textContent = '$' + (gMes?.[0]?.ganancia_neta || 0).toLocaleString();

        const { data: top } = await db.from('productos_mas_vendidos').select('*').limit(5);
        if (top && top.length > 0) {
            document.getElementById('topProductosList').innerHTML = top.map(p =>
                `<div class="top-item"><span>${p.nombre}</span><span>${p.vendidos_mes} vendidos</span></div>`).join("");
        }

        const stockBajo = App.articulos.filter(a => a.stock <= 5 && !a.agotado);
        const alertasDiv = document.getElementById('alertasStock');
        if (alertasDiv) {
            alertasDiv.innerHTML = stockBajo.length > 0 ?
                '<strong>⚠️ STOCK BAJO:</strong>' + stockBajo.slice(0, 5).map(a => `<div class="alerta-item"><span>${a.nombre}</span><span style="color:#ef4444;">Quedan ${a.stock}</span></div>`).join("") :
                '<p style="color:#25D366;">✅ Todo en niveles óptimos</p>';
        }
    } catch (e) { 
        console.error('Error cargando estadísticas:', e); 
    }
}

// ========== INICIALIZACIÓN ==========
document.addEventListener("DOMContentLoaded", init);

// Sincronización automática cada 30 segundos
setInterval(() => {
    if (navigator.onLine) sync();
}, 30000);

console.log('📦 script.js cargado correctamente');
