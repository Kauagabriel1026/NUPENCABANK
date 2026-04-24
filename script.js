import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDLIba29qAeMu6PNoRVAbW4WCHod5a8JqI",
    authDomain: "nupencabank.firebaseapp.com",
    projectId: "nupencabank",
    storageBucket: "nupencabank.firebasestorage.app",
    messagingSenderId: "722876161968",
    appId: "1:722876161968:web:c4cbce962d05478a48c075"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Agora o 'auth' e o 'db' estão definidos dentro deste arquivo!
window.auth = auth;
window.db = db;

console.log("Firebase carregado!");

let usuarioAtual = null;
let saldoOculto = false;

// ════════════════════════════
//  TEMA (LIGHT / DARK)
// ════════════════════════════
function toggleTheme() {
    const body = document.body;
    body.classList.toggle('light-mode');
    const isLight = body.classList.contains('light-mode');
    localStorage.setItem('nupenca-theme', isLight ? 'light' : 'dark');
}

// Carregar tema salvo
if (localStorage.getItem('nupenca-theme') === 'light') {
    document.body.classList.add('light-mode');
}

// ════════════════════════════
//  HISTÓRICO DE ACESSO
// ════════════════════════════
const historicoAcessos = {};

// Funções para pegar dados 100% REAIS do usuário
function obterDispositivoReal() {
    const ua = navigator.userAgent;
    let browser = "Desconhecido";
    if (ua.includes("Edg")) browser = "Edge";
    else if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
    
    let os = "Desconhecido";
    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac OS")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone")) os = "iPhone";

    return `${browser} · ${os}`;
}

async function obterIpReal() {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        return data.ip;
    } catch (e) {
        return 'IP Oculto';
    }
}

async function registrarAcesso(email, status, nomeTentativa) {
    const agora = new Date();
    const ipReal = await obterIpReal(); // Espera a API devolver o seu IP público
    const entrada = {
        email_user: email,
        status,
        nome: nomeTentativa || email,
        data: agora.toLocaleDateString('pt-BR'),
        hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        timestamp: agora.getTime(),
        ip: ipReal,
        dispositivo: obterDispositivoReal(),
    };
    try {
        await addDoc(collection(db, "acessos"), entrada);
    } catch (e) { console.error("Erro ao registrar acesso no log:", e); }
}

async function abrirPainelHistorico() {
    fecharTodosPaineis();
    await renderizarHistorico('todos');
    const el = document.getElementById('painel-historico');
    el.classList.add('active');
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function filtrarAcessos(filtro, btnEl) {
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
    renderizarHistoricoVisual(filtro);
}

let acessosCarregados = [];

async function renderizarHistorico(filtro) {
    document.getElementById('acesso-list').innerHTML = '<div class="acesso-empty">Buscando do Firebase... 🍌</div>';

    // Fetch from Firestore
    try {
        const q = query(
            collection(db, "acessos"),
            where("email_user", "==", usuarioAtual.email)
        );
        const querySnapshot = await getDocs(q);
        acessosCarregados = [];
        querySnapshot.forEach((docRef) => {
            acessosCarregados.push(docRef.data());
        });

        // Ordena e limita pelo JavaScript para não exigir criação manual de Índices no Firebase
        acessosCarregados.sort((a, b) => b.timestamp - a.timestamp);
        acessosCarregados = acessosCarregados.slice(0, 50);
    } catch (e) { console.error("Erro ao buscar logs", e); }

    renderizarHistoricoVisual(filtro);
}

function renderizarHistoricoVisual(filtro) {
    const todos = acessosCarregados;
    const filtrado = filtro === 'todos' ? todos : todos.filter(a => a.status === filtro);

    const totalSucessos = todos.filter(a => a.status === 'sucesso').length;
    const totalFalhas = todos.filter(a => a.status === 'falha').length;
    const ultimoAcesso = todos.find(a => a.status === 'sucesso');

    document.getElementById('acesso-resumo').innerHTML = `
        <div class="acesso-stat"><div class="acesso-stat-val yellow">${todos.length}</div><div class="acesso-stat-label">Total</div></div>
        <div class="acesso-stat"><div class="acesso-stat-val green">${totalSucessos}</div><div class="acesso-stat-label">Sucessos</div></div>
        <div class="acesso-stat"><div class="acesso-stat-val red">${totalFalhas}</div><div class="acesso-stat-label">Falhas</div></div>
        <div class="acesso-stat"><div class="acesso-stat-val yellow" style="font-size:13px;padding-top:4px;">${ultimoAcesso ? ultimoAcesso.hora : '--'}</div><div class="acesso-stat-label">Último</div></div>
    `;

    const ul = document.getElementById('acesso-list');
    if (filtrado.length === 0) {
        ul.innerHTML = '<div class="acesso-empty">🍌 Nenhum registro encontrado na nuvem.</div>';
        return;
    }
    ul.innerHTML = filtrado.map(item => `
        <li class="acesso-item ${item.status}">
            <div class="acesso-item-left">
                <div class="acesso-status-icon ${item.status}">${item.status === 'sucesso' ? '✅' : '❌'}</div>
                <div>
                    <div class="acesso-info-nome">${item.dispositivo}</div>
                    <div class="acesso-info-detalhe">IP: ${item.ip} · ${item.data} às ${item.hora}</div>
                </div>
            </div>
            <div class="acesso-item-right">
                <span class="acesso-badge ${item.status}">${item.status === 'sucesso' ? 'Sucesso' : 'Falha'}</span>
                <span class="acesso-data">${item.data}</span>
            </div>
        </li>
    `).join('');
}

// ════════════════════════════
//  EXTRATO
// ════════════════════════════
let extrato = [];

// ════════════════════════════
//  NAVEGAÇÃO
// ════════════════════════════
function mostrarTela(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}
function irParaCadastro() { mostrarTela('screen-cadastro'); }
function irParaLogin() { mostrarTela('screen-login'); }

// ════════════════════════════
//  AUTENTICAÇÃO
// ════════════════════════════
async function fazerLogin() {
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const err = document.getElementById('login-error');

    if (!email || !senha) {
        err.textContent = 'Preencha E-mail e senha.';
        err.style.display = 'block';
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;

        // VERIFICAÇÃO DE E-MAIL DESATIVADA PARA FACILITAR OS TESTES DO PROJETO 🍌
        /*
        if (!user.emailVerified) {
            err.textContent = 'Por favor, verifique seu e-mail antes de entrar.';
            err.style.display = 'block';
            shake(document.querySelector('.auth-card'));
            await signOut(auth);
            return;
        }
        */

        // Buscar os dados do profile logado no Firestore
        const docSnap = await getDoc(doc(db, "profiles", user.uid));

        if (docSnap.exists()) {
            usuarioAtual = docSnap.data();
            usuarioAtual.id = user.uid;
            usuarioAtual.email = user.email;
        } else {
            usuarioAtual = { id: user.uid, email: user.email, nome: 'Usuário', saldo: 0, cpf: 'N/A' };
            await setDoc(doc(db, "profiles", user.uid), usuarioAtual);
        }
    } catch (error) {
        err.textContent = 'E-mail ou senha incorretos.';
        err.style.display = 'block';
        shake(document.querySelector('.auth-card'));
        registrarAcesso(email, 'falha', email);
        return;
    }

    err.style.display = 'none';
    registrarAcesso(email, 'sucesso', usuarioAtual.nome);
    iniciarDashboard();
    mostrarTela('screen-home');
    document.getElementById('nanica-fab').classList.add('visible');
    showToast('🍌 Bem-vindo, ' + usuarioAtual.nome.split(' ')[0] + '!', 'info');
}

async function fazerLogout() {
    await signOut(auth);
    usuarioAtual = null;
    document.getElementById('login-email').value = '';
    document.getElementById('login-senha').value = '';
    fecharTodosPaineis();
    document.getElementById('nanica-fab').classList.remove('visible');
    document.getElementById('nanica-chat').classList.remove('active');
    nanicaAberto = false;
    mostrarTela('screen-login');
    showToast('Até logo! 🍌', 'info');
}

async function recuperarSenha() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) {
        showToast('Digite seu e-mail no campo acima para recuperar a senha 🍌', 'error');
        shake(document.querySelector('.auth-card'));
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        showToast('E-mail de recuperação enviado! Verifique sua caixa de entrada.', 'success');
    } catch (error) {
        console.error(error);
        showToast('Erro ao recuperar senha. O e-mail está correto?', 'error');
    }
}

async function fazerCadastro() {
    const nome = document.getElementById('cad-nome').value.trim();
    const cpf = document.getElementById('cad-cpf').value.trim();
    const cep = document.getElementById('cad-cep')?.value.trim() || '';
    const endereco = document.getElementById('cad-endereco')?.value.trim() || '';
    const bairro = document.getElementById('cad-bairro')?.value.trim() || '';
    const cidade = document.getElementById('cad-cidade')?.value.trim() || '';
    const emailReal = document.getElementById('cad-email').value.trim();
    const nasc = document.getElementById('cad-nasc').value;
    const senha = document.getElementById('cad-senha').value;
    const senha2 = document.getElementById('cad-senha2').value;
    const err = document.getElementById('cad-error');

    if (!nome || !cpf || !emailReal || !nasc || !senha) { err.textContent = 'Preencha todos os campos obrigatórios.'; err.style.display = 'block'; return; }
    if (senha.length < 6) { err.textContent = 'Senha precisa ter ao menos 6 caracteres.'; err.style.display = 'block'; return; }
    if (senha !== senha2) { err.textContent = 'As senhas não coincidem.'; err.style.display = 'block'; return; }

    try {
        // 1. Criar o usuário no Auth usando o e-mail real
        const userCredential = await createUserWithEmailAndPassword(auth, emailReal, senha);
        const user = userCredential.user;

        // Enviar e-mail de verificação
        await sendEmailVerification(user);

        // 2. Inserir no Firestore Document com o Endereço Automático
        await setDoc(doc(db, "profiles", user.uid), {
            id: user.uid,
            nome: nome,
            cpf: cpf,
            cep: cep,
            endereco: endereco,
            bairro: bairro,
            cidade: cidade,
            nasc: nasc,
            email: emailReal,
            saldo: 0.00
        });

    } catch (error) {
        err.textContent = error.message;
        err.style.display = 'block';

        // Mensagem de erro amigável se o email já existe
        if (error.code === 'auth/email-already-in-use') {
            alert("Ops! Esse e-mail já está cadastrado. Vá para a tela de Login e tente acessar.");
        } else {
            alert("Ops! Erro ao criar conta (Firebase): \n" + error.message);
        }
        return;
    }

    err.style.display = 'none';
    showToast('🍌 Conta criada! Verifique seu e-mail e faça login.', 'success');
    await signOut(auth); // Desloga, para o usuário validar o e-mail antes
    setTimeout(() => irParaLogin(), 1500);
}

// ════════════════════════════
//  DASHBOARD
// ════════════════════════════
async function iniciarDashboard() {
    const primeiroNome = usuarioAtual.nome.split(' ')[0];
    document.getElementById('topbar-nome').textContent = 'Olá, ' + primeiroNome;
    document.getElementById('topbar-avatar').textContent = primeiroNome[0].toUpperCase();

    const cardHolder = document.getElementById('card-holder-name');
    if (cardHolder) cardHolder.textContent = usuarioAtual.nome.toUpperCase();

    // Carregar extrato do Firestore
    try {
        const q = query(
            collection(db, "extratos"),
            where("user_id", "==", usuarioAtual.id),
            orderBy("timestamp", "desc"),
            limit(15)
        );
        const querySnapshot = await getDocs(q);

        extrato = [];
        querySnapshot.forEach((docRef) => {
            const dbItem = docRef.data();
            extrato.push({
                tipo: dbItem.tipo,
                icone: dbItem.icone,
                desc: dbItem.descricao,
                data: dbItem.data_transacao,
                valor: Number(dbItem.valor)
            });
        });
    } catch (e) { console.error("Erro extrato:", e); }

    // Carregar saldo atualizado (e cofrinho)
    const snap = await getDoc(doc(db, "profiles", usuarioAtual.id));
    if (snap.exists()) {
        const d = snap.data();
        usuarioAtual.saldo = Number(d.saldo || 0);
        usuarioAtual.cofrinho = Number(d.cofrinho || 0);
        // Garantir Agência e Conta
        if (!d.agencia || !d.conta) {
            const numConta = Math.floor(100000 + Math.random() * 900000) + '-' + Math.floor(Math.random() * 10);
            usuarioAtual.agencia = '0001';
            usuarioAtual.conta = numConta;
            await setDoc(doc(db, "profiles", usuarioAtual.id), { agencia: '0001', conta: numConta }, { merge: true });
        } else {
            usuarioAtual.agencia = d.agencia;
            usuarioAtual.conta = d.conta;
        }
        // Cartão VIP / Black
        usuarioAtual.tipoCartao = d.tipo_cartao || 'gold';
        usuarioAtual.limiteCredito = Number(d.limite_credito || 5000);
    }

    atualizarSaldo();
    renderizarExtrato();
    carregarConfigSeguranca();
    aplicarTipoCartao(usuarioAtual.tipoCartao || 'gold', usuarioAtual.limiteCredito || 5000);
}

function atualizarSaldo() {
    const el = document.getElementById('saldo-display');
    const cofEl = document.getElementById('cofrinho-display');
    const cofPainel = document.getElementById('cofrinho-total-painel');
    
    el.textContent = saldoOculto ? 'R$ ••••••' : 'R$ ' + usuarioAtual.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    
    if (usuarioAtual.cofrinho !== undefined) {
        const txtCof = saldoOculto ? 'R$ ••••••' : 'R$ ' + usuarioAtual.cofrinho.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        if (cofEl) cofEl.textContent = txtCof;
        if (cofPainel) cofPainel.textContent = txtCof;
    }
}

function toggleSaldo() {
    saldoOculto = !saldoOculto;
    document.querySelector('.toggle-saldo').textContent = saldoOculto ? '👁 Mostrar' : '👁 Ocultar';
    atualizarSaldo();
}

// ════════════════════════════
//  PAINÉIS
// ════════════════════════════
function abrirPainel(id) {
    fecharTodosPaineis();
    const el = document.getElementById(id);
    el.classList.add('active');
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}
function fecharPainel(id) { document.getElementById(id).classList.remove('active'); }
function fecharTodosPaineis() { document.querySelectorAll('.panel').forEach(p => p.classList.remove('active')); }

// ════════════════════════════
//  CONFIGURAÇÕES (PERFIL)
// ════════════════════════════
function abrirPainelConfig() {
    document.getElementById('config-nome').textContent = usuarioAtual.nome;
    document.getElementById('config-cpf').textContent = usuarioAtual.cpf;
    document.getElementById('config-email').textContent = usuarioAtual.email;
    document.getElementById('config-agencia').textContent = usuarioAtual.agencia || '0001';
    document.getElementById('config-conta').textContent = usuarioAtual.conta || '---';
    abrirPainel('painel-config');
}

// ════════════════════════════
//  COFRINHO DAS BANANAS
// ════════════════════════════
async function guardarNoCofrinho() {
    const valor = limparMoeda(document.getElementById('cofrinho-valor').value);
    if (!valor || valor <= 0) { showToast('Informe um valor válido.', 'error'); return; }
    if (valor > usuarioAtual.saldo) { showToast('Saldo insuficiente para guardar 😢', 'error'); return; }

    usuarioAtual.saldo -= valor;
    usuarioAtual.cofrinho = (usuarioAtual.cofrinho || 0) + valor;

    try {
        await setDoc(doc(db, "profiles", usuarioAtual.id), {
            saldo: usuarioAtual.saldo,
            cofrinho: usuarioAtual.cofrinho
        }, { merge: true });
        
        await registrarTransacao('out', '🧺', 'Guardado no Cofrinho', valor);
        
        atualizarSaldo();
        renderizarExtrato();
        document.getElementById('cofrinho-valor').value = '';
        showToast('R$ ' + valor.toFixed(2) + ' guardados no Cofrinho! 🍌', 'success');
    } catch (e) {
        showToast('Erro ao guardar dinheiro.', 'error');
    }
}

async function resgatarDoCofrinho() {
    const valor = limparMoeda(document.getElementById('cofrinho-valor').value);
    if (!valor || valor <= 0) { showToast('Informe um valor válido.', 'error'); return; }
    if (valor > (usuarioAtual.cofrinho || 0)) { showToast('Valor maior do que tem no cofrinho 😢', 'error'); return; }

    usuarioAtual.cofrinho -= valor;
    usuarioAtual.saldo += valor;

    try {
        await setDoc(doc(db, "profiles", usuarioAtual.id), {
            saldo: usuarioAtual.saldo,
            cofrinho: usuarioAtual.cofrinho
        }, { merge: true });
        
        await registrarTransacao('in', '🧺', 'Resgate do Cofrinho', valor);
        
        atualizarSaldo();
        renderizarExtrato();
        document.getElementById('cofrinho-valor').value = '';
        showToast('R$ ' + valor.toFixed(2) + ' resgatados para o saldo! 🍌', 'success');
    } catch (e) {
        showToast('Erro ao resgatar dinheiro.', 'error');
    }
}

// ════════════════════════════════════════
//  SEGURANÇA: CONFIGS
// ════════════════════════════════════════
let configSeguranca = {
    alertaNoturno: true,
    limitePix: true,
    limitePixValor: 750,
    pixGastoHoje: 0,
    pixDataHoje: hoje(),
    modoRua: false,
};

function carregarConfigSeguranca() {
    const saved = localStorage.getItem('nupenca-seguranca');
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(configSeguranca, parsed);
    }
    if (configSeguranca.pixDataHoje !== hoje()) {
        configSeguranca.pixGastoHoje = 0;
        configSeguranca.pixDataHoje = hoje();
        salvarConfigSeguranca();
    }
    const tNoturno = document.getElementById('toggle-noturno');
    const tLimite = document.getElementById('toggle-limite-pix');
    if (tNoturno) tNoturno.checked = configSeguranca.alertaNoturno;
    if (tLimite) tLimite.checked = configSeguranca.limitePix;
    const inputLimite = document.getElementById('config-limite-valor');
    if (inputLimite) inputLimite.value = 'R$ ' + configSeguranca.limitePixValor.toFixed(2).replace('.', ',');
    if (configSeguranca.modoRua) aplicarModoRua(true);
    atualizarBarraLimite();
}
function salvarConfigSeguranca() {
    localStorage.setItem('nupenca-seguranca', JSON.stringify(configSeguranca));
}
function toggleAlertaNoturno() {
    configSeguranca.alertaNoturno = document.getElementById('toggle-noturno').checked;
    salvarConfigSeguranca();
    showToast(configSeguranca.alertaNoturno ? '🌙 Alerta noturno ativado' : 'Alerta noturno desativado', 'info');
}
function toggleLimitePix() {
    configSeguranca.limitePix = document.getElementById('toggle-limite-pix').checked;
    salvarConfigSeguranca();
    atualizarBarraLimite();
    showToast(configSeguranca.limitePix ? '📊 Limite Pix diário ativado' : 'Limite Pix diário desativado', 'info');
}
function salvarLimitePix() {
    const v = limparMoeda(document.getElementById('config-limite-valor').value);
    if (v && v > 0) {
        configSeguranca.limitePixValor = v;
        salvarConfigSeguranca();
        atualizarBarraLimite();
        showToast('Limite atualizado para R$ ' + v.toFixed(2), 'success');
    }
}
function atualizarBarraLimite() {
    const wrap = document.getElementById('limite-pix-wrap');
    const texto = document.getElementById('limite-pix-texto');
    const fill = document.getElementById('limite-pix-fill');
    if (!wrap) return;
    if (!configSeguranca.limitePix) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    const pct = Math.min((configSeguranca.pixGastoHoje / configSeguranca.limitePixValor) * 100, 100);
    fill.style.width = pct + '%';
    fill.className = 'limite-pix-fill' + (pct >= 90 ? ' danger' : '');
    texto.textContent = 'R$ ' + configSeguranca.pixGastoHoje.toFixed(0) + ' / R$ ' + configSeguranca.limitePixValor.toFixed(0);
}

// ════════════════════════════════════════
//  SEGURANÇA: HORÁRIO NOTURNO
// ════════════════════════════════════════
function isHorarioNoturno() {
    const h = new Date().getHours();
    return h >= 19 || h < 5;
}
let _resolveNoturno = null;
function verificarNoturno() {
    return new Promise(resolve => {
        if (!configSeguranca.alertaNoturno || !isHorarioNoturno()) { resolve(true); return; }
        _resolveNoturno = resolve;
        document.getElementById('modal-noturno').classList.add('active');
    });
}
function confirmarNoturno() {
    document.getElementById('modal-noturno').classList.remove('active');
    if (_resolveNoturno) _resolveNoturno(true);
}
function cancelarNoturno() {
    document.getElementById('modal-noturno').classList.remove('active');
    if (_resolveNoturno) _resolveNoturno(false);
}

// ════════════════════════════════════════
//  SEGURANÇA: CONFIRMAÇÃO DE SENHA PIX
// ════════════════════════════════════════
let _resolveSenha = null;
let tentativasSenha = 0;
let bloqueioSenha = false;

function pedirSenhaPix() {
    return new Promise(resolve => {
        if (bloqueioSenha) { showToast('⏳ Aguarde 30s — muitas tentativas erradas.', 'error'); resolve(false); return; }
        _resolveSenha = resolve;
        document.getElementById('modal-senha-input').value = '';
        document.getElementById('modal-senha-input').classList.remove('error');
        document.getElementById('modal-tentativas').style.display = 'none';
        document.getElementById('modal-senha-pix').classList.add('active');
        setTimeout(() => document.getElementById('modal-senha-input').focus(), 100);
    });
}
async function confirmarSenhaPix() {
    const senhaDigitada = document.getElementById('modal-senha-input').value;
    if (!senhaDigitada) return;
    try {
        await signInWithEmailAndPassword(auth, usuarioAtual.email, senhaDigitada);
        tentativasSenha = 0;
        document.getElementById('modal-senha-pix').classList.remove('active');
        if (_resolveSenha) _resolveSenha(true);
    } catch (e) {
        tentativasSenha++;
        const input = document.getElementById('modal-senha-input');
        const msg = document.getElementById('modal-tentativas');
        input.classList.add('error');
        input.value = '';
        setTimeout(() => input.classList.remove('error'), 400);
        if (tentativasSenha >= 3) {
            bloqueioSenha = true;
            msg.textContent = '🔒 Bloqueado por 30 segundos.';
            msg.style.display = 'block';
            setTimeout(() => { bloqueioSenha = false; tentativasSenha = 0; }, 30000);
            document.getElementById('modal-senha-pix').classList.remove('active');
            if (_resolveSenha) _resolveSenha(false);
            showToast('🔒 Muitas tentativas! Bloqueado por 30s.', 'error');
        } else {
            msg.textContent = `Senha incorreta. Tentativa ${tentativasSenha}/3`;
            msg.style.display = 'block';
        }
    }
}
function fecharModalSenha() {
    document.getElementById('modal-senha-pix').classList.remove('active');
    if (_resolveSenha) _resolveSenha(false);
}

// ════════════════════════════════════════
//  SEGURANÇA: MODO RUA
// ════════════════════════════════════════
function abrirPainelModoRua() {
    abrirPainel('painel-modo-rua');
    // Sync UI
    atualizarUIModoRua();
    const tNoturno = document.getElementById('toggle-noturno-rua');
    const tLimite = document.getElementById('toggle-limite-pix-rua');
    const slider = document.getElementById('slider-limite-pix');
    const sliderVal = document.getElementById('slider-limite-valor');
    if (tNoturno) tNoturno.checked = configSeguranca.alertaNoturno;
    if (tLimite) tLimite.checked = configSeguranca.limitePix;
    if (slider) slider.value = configSeguranca.limitePixValor;
    if (sliderVal) sliderVal.textContent = 'R$ ' + configSeguranca.limitePixValor;
}

function toggleModoRua() {
    configSeguranca.modoRua = !configSeguranca.modoRua;
    aplicarModoRua(configSeguranca.modoRua);
    atualizarUIModoRua();
    salvarConfigSeguranca();
    if (configSeguranca.modoRua) {
        showToast('🛡️ Modo Rua ATIVADO — transações bloqueadas!', 'info');
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                console.log('Modo Rua ativado em:', pos.coords.latitude, pos.coords.longitude);
            }, () => {});
        }
    } else {
        showToast('Modo Rua desativado — transações liberadas.', 'success');
    }
}

function atualizarUIModoRua() {
    const ativo = configSeguranca.modoRua;
    const card = document.getElementById('modo-rua-status-card');
    const emoji = document.getElementById('modo-rua-emoji');
    const texto = document.getElementById('modo-rua-status-text');
    const sub = document.getElementById('modo-rua-status-sub');
    const btn = document.getElementById('btn-toggle-modo-rua');
    if (!card) return;

    if (ativo) {
        card.style.borderColor = 'var(--danger)';
        card.style.background = 'rgba(255, 59, 48, 0.08)';
        emoji.textContent = '🔴';
        texto.textContent = 'ATIVADO';
        texto.style.color = 'var(--danger)';
        sub.textContent = 'Todas as transações estão bloqueadas';
        btn.textContent = '🔓 Desativar Modo Rua';
        btn.style.background = 'var(--danger)';
    } else {
        card.style.borderColor = '#3a3a3a';
        card.style.background = 'var(--dark3)';
        emoji.textContent = '🛡️';
        texto.textContent = 'Desativado';
        texto.style.color = '';
        sub.textContent = 'Suas transações estão liberadas';
        btn.textContent = '🔒 Ativar Modo Rua';
        btn.style.background = '';
    }
}

function atualizarSliderLimite(val) {
    document.getElementById('slider-limite-valor').textContent = 'R$ ' + val;
    configSeguranca.limitePixValor = parseInt(val);
    salvarConfigSeguranca();
    atualizarBarraLimite();
    // Sync config panel input
    const inputLimite = document.getElementById('config-limite-valor');
    if (inputLimite) inputLimite.value = 'R$ ' + parseInt(val).toFixed(2).replace('.', ',');
}

function aplicarModoRua(ativo) {
    const badge = document.getElementById('modo-rua-badge');
    const cardOverlay = document.getElementById('card-blocked-overlay');
    const btn = document.getElementById('btn-modo-rua');
    if (badge) badge.classList.toggle('active', ativo);
    if (cardOverlay) cardOverlay.classList.toggle('active', ativo);
    if (btn) btn.style.borderColor = ativo ? 'var(--danger)' : '';
}

// ════════════════════════════
//  CARTÃO VIP / BLACK
// ════════════════════════════
function aplicarTipoCartao(tipo, limiteCredito) {
    const cardFront = document.getElementById('card-front');
    const cardObject = document.getElementById('card-object');
    const tipoBadge = document.getElementById('card-tipo-badge');
    const limiteEl = document.getElementById('card-limite-credito');

    if (!cardFront) return;

    if (tipo === 'black') {
        cardFront.classList.add('card-black');
        if (tipoBadge) tipoBadge.textContent = 'BLACK';
    } else {
        cardFront.classList.remove('card-black');
        if (tipoBadge) tipoBadge.textContent = 'GOLD';
    }

    if (limiteEl && limiteCredito) {
        limiteEl.textContent = 'R$ ' + limiteCredito.toLocaleString('pt-BR');
    }
}

// ════════════════════════════
//  SALVAR TRANSAÇÃO HELPER
// ════════════════════════════
async function registrarTransacao(tipo, icone, descricao, valor) {
    if (!usuarioAtual || !usuarioAtual.id) return false;

    const dataAtual = hoje();
    const ts = Date.now();

    const tx = {
        user_id: usuarioAtual.id,
        tipo, icone, descricao,
        data_transacao: dataAtual,
        valor: valor,
        timestamp: ts
    };

    try {
        await addDoc(collection(db, "extratos"), tx);
        await setDoc(doc(db, "profiles", usuarioAtual.id), {
            saldo: usuarioAtual.saldo
        }, { merge: true });

        extrato.unshift({ tipo, icone, desc: descricao, data: tx.data_transacao, valor });
        return true;
    } catch (erroTransacao) {
        console.error(erroTransacao);
        return false;
    }
}

// ════════════════════════════
//  PIX (COM SEGURANÇA)
// ════════════════════════════
async function realizarPix() {
    const chave = document.getElementById('pix-chave').value.trim();
    const valor = limparMoeda(document.getElementById('pix-valor').value);

    if (!chave) { showToast('Informe a chave Pix.', 'error'); return; }
    if (!valor || valor <= 0) { showToast('Informe um valor válido.', 'error'); return; }
    if (valor > usuarioAtual.saldo) { showToast('Saldo insuficiente 😢', 'error'); return; }

    // 1️⃣ MODO RUA
    if (configSeguranca.modoRua) {
        showToast('🛡️ Modo Rua ativo! Desative para fazer Pix.', 'error');
        return;
    }
    // 2️⃣ ALERTA NOTURNO
    const okNoturno = await verificarNoturno();
    if (!okNoturno) return;
    // 3️⃣ LIMITE DIÁRIO
    if (configSeguranca.limitePix) {
        if (configSeguranca.pixDataHoje !== hoje()) {
            configSeguranca.pixGastoHoje = 0;
            configSeguranca.pixDataHoje = hoje();
        }
        if (configSeguranca.pixGastoHoje + valor > configSeguranca.limitePixValor) {
            showToast('📊 Limite diário de R$ ' + configSeguranca.limitePixValor.toFixed(0) + ' atingido!', 'error');
            return;
        }
    }
    // 4️⃣ CONFIRMAÇÃO DE SENHA
    const okSenha = await pedirSenhaPix();
    if (!okSenha) return;

    // ✅ EXECUTAR PIX
    const curSaldo = usuarioAtual.saldo;
    usuarioAtual.saldo -= valor;

    const sucesso = await registrarTransacao('out', '🔑', 'Pix enviado — ' + chave, valor);
    if (!sucesso) {
        usuarioAtual.saldo = curSaldo;
        showToast('Erro ao realizar a transação. Tente novamente.', 'error');
        return;
    }

    configSeguranca.pixGastoHoje += valor;
    salvarConfigSeguranca();
    atualizarSaldo();
    atualizarBarraLimite();
    renderizarExtrato();
    document.getElementById('pix-chave').value = '';
    document.getElementById('pix-valor').value = '';
    fecharPainel('painel-pix');
    showToast('✅ Pix de R$ ' + valor.toFixed(2) + ' enviado!', 'success');
}


// ════════════════════════════
//  BOLETO
// ════════════════════════════
async function pagarBoleto() {
    const codigo = document.getElementById('boleto-codigo').value.trim();
    const valor = limparMoeda(document.getElementById('boleto-valor').value);

    if (!codigo || codigo.length < 8) { showToast('Código de barras inválido.', 'error'); return; }
    if (!valor || valor <= 0) { showToast('Informe o valor do boleto.', 'error'); return; }
    if (valor > usuarioAtual.saldo) { showToast('Saldo insuficiente 😢', 'error'); return; }

    const curSaldo = usuarioAtual.saldo;
    usuarioAtual.saldo -= valor;

    const sucesso = await registrarTransacao('out', '📄', 'Pagamento de boleto', valor);
    if (!sucesso) {
        usuarioAtual.saldo = curSaldo;
        showToast('Erro ao pagar o boleto. Tente novamente.', 'error');
        return;
    }

    atualizarSaldo();
    renderizarExtrato();
    document.getElementById('boleto-codigo').value = '';
    document.getElementById('boleto-valor').value = '';
    fecharPainel('painel-pagamento');
    showToast('✅ Boleto pago com sucesso!', 'success');
}

// ════════════════════════════
//  EXTRATO
// ════════════════════════════
function renderizarExtrato() {
    const ul = document.getElementById('extrato-list');
    ul.innerHTML = '';

    if (extrato.length === 0) {
        ul.innerHTML = '<li class="extrato-item"><div class="extrato-desc" style="color:var(--gray);text-align:center;width:100%;padding:10px 0;">Nenhuma movimentação ainda.</div></li>';
        return;
    }

    extrato.slice(0, 10).forEach(item => {
        const sinal = item.tipo === 'out' ? '-' : '+';
        ul.innerHTML += `
        <li class="extrato-item">
            <div class="extrato-info">
                <div class="extrato-icon ${item.tipo}">${item.icone}</div>
                <div>
                    <div class="extrato-desc">${item.desc}</div>
                    <div class="extrato-date">${item.data}</div>
                </div>
            </div>
            <div class="extrato-val ${item.tipo}">${sinal} R$ ${item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </li>`;
    });
}

// ════════════════════════════
//  EMPRÉSTIMO
// ════════════════════════════
function simularEmprestimo() {
    const valor = limparMoeda(document.getElementById('emp-valor').value);
    const parcelas = parseInt(document.getElementById('emp-parcelas').value);

    if (!valor || valor < 100) { showToast('Informe um valor mínimo de R$100.', 'error'); return; }
    if (valor > 12000) { showToast('Limite máximo é R$ 12.000.', 'error'); return; }

    const taxa = 0.0199;
    const parcela = (valor * taxa) / (1 - Math.pow(1 + taxa, -parcelas));
    document.getElementById('emp-parcela-val').textContent = `${parcelas}x de R$ ${parcela.toFixed(2).replace('.', ',')} / mês`;
    document.getElementById('emp-simulacao').style.display = 'block';
}

async function solicitarEmprestimo() {
    const valor = limparMoeda(document.getElementById('emp-valor').value);
    if (!valor || valor < 100) { showToast('Simule primeiro o empréstimo.', 'error'); return; }

    const curSaldo = usuarioAtual.saldo;
    usuarioAtual.saldo += valor;

    const sucesso = await registrarTransacao('in', '💛', 'Empréstimo Cacho aprovado', valor);
    if (!sucesso) {
        usuarioAtual.saldo = curSaldo;
        showToast('Erro ao confirmar empréstimo. Tente novamente.', 'error');
        return;
    }

    atualizarSaldo();
    renderizarExtrato();
    document.getElementById('emp-valor').value = '';
    document.getElementById('emp-simulacao').style.display = 'none';
    fecharPainel('painel-emprestimo');
    showToast('🍌 Empréstimo de R$ ' + valor.toFixed(2) + ' aprovado!', 'success');
}

// ════════════════════════════
//  UTILITÁRIOS
// ════════════════════════════
function hoje() { return new Date().toLocaleDateString('pt-BR'); }

let toastTimer;
function showToast(msg, tipo = 'info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, 3200);
}

function shake(el) {
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'shake 0.4s ease';
}

function mascaraCEP(input) {
    let v = input.value.replace(/\D/g, '').substring(0, 8);
    v = v.replace(/(\d{5})(\d)/, '$1-$2');
    input.value = v;

    if (v.length === 9) {
        buscarCEP(v.replace('-', ''));
    }
}

async function buscarCEP(cep) {
    const endereco = document.getElementById('cad-endereco');
    const bairro = document.getElementById('cad-bairro');
    const cidade = document.getElementById('cad-cidade');

    endereco.value = "Buscando...";
    bairro.value = "Buscando...";
    cidade.value = "Buscando...";

    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();

        if (data.erro) {
            endereco.value = "CEP não encontrado 🍌";
            bairro.value = "";
            cidade.value = "";
            return;
        }

        endereco.value = data.logradouro;
        bairro.value = data.bairro;
        cidade.value = `${data.localidade} - ${data.uf}`;
    } catch (e) {
        endereco.value = "Erro na busca";
        bairro.value = "";
        cidade.value = "";
    }
}

function mascaraCPF(input) {
    let v = input.value.replace(/\D/g, '').substring(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    input.value = v;
}

function mascaraMoeda(input) {
    let valor = input.value.replace(/\D/g, '');
    valor = (valor / 100).toFixed(2) + '';
    valor = valor.replace('.', ',');
    valor = valor.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    input.value = valor === '0,00' ? '' : 'R$ ' + valor;
}

function limparMoeda(v) {
    if (!v) return 0;
    return parseFloat(v.replace('R$ ', '').replace(/\./g, '').replace(',', '.'));
}

const style = document.createElement('style');
style.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}`;
document.head.appendChild(style);

document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('screen-login').classList.contains('active')) fazerLogin();
});

// ════════════════════════════════════════
//  NANICA — ASSISTENTE VIRTUAL 🍌
// ════════════════════════════════════════
let nanicaAberto = false;

function toggleNanica() {
    nanicaAberto = !nanicaAberto;
    document.getElementById('nanica-chat').classList.toggle('active', nanicaAberto);
    document.getElementById('nanica-fab').classList.toggle('visible', !nanicaAberto);

    if (nanicaAberto) {
        const msgs = document.getElementById('nanica-messages');
        if (msgs.children.length === 0) {
            const h = new Date().getHours();
            let saudacao = 'Bom dia';
            if (h >= 12 && h < 18) saudacao = 'Boa tarde';
            else if (h >= 18 || h < 5) saudacao = 'Boa noite';

            const nome = usuarioAtual ? usuarioAtual.nome.split(' ')[0] : 'cliente';
            adicionarMsgNanica(`${saudacao}, ${nome}! 🍌 Eu sou a **Nanica**, sua assistente virtual do Nupenca Bank. Como posso te ajudar?`);
        }
        setTimeout(() => document.getElementById('nanica-input').focus(), 200);
    }
}

function enviarChipNanica(texto) {
    adicionarMsgUsuario(texto);
    processarNanica(texto);
}

function enviarMsgNanica() {
    const input = document.getElementById('nanica-input');
    const texto = input.value.trim();
    if (!texto) return;
    input.value = '';
    adicionarMsgUsuario(texto);
    processarNanica(texto);
}

function adicionarMsgUsuario(texto) {
    const msgs = document.getElementById('nanica-messages');
    const div = document.createElement('div');
    div.className = 'nanica-msg user';
    div.textContent = texto;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

function adicionarMsgNanica(texto) {
    const msgs = document.getElementById('nanica-messages');
    const div = document.createElement('div');
    div.className = 'nanica-msg bot';
    div.innerHTML = texto.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

// ════════════════════════════════════════
//  GROQ API — NANICA I.A. REAL 🧠🍌
// ════════════════════════════════════════
const GROQ_API_KEY = 'SUA_CHAVE_GROQ_AQUI'; // Substitua pela sua chave gsk_...
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

let nanicaHistorico = []; // formato: [{role: 'user'|'assistant', content: '...'}]

function getSystemPromptNanica() {
    const nome = usuarioAtual ? usuarioAtual.nome : 'Cliente';
    const saldo = usuarioAtual ? 'R$ ' + usuarioAtual.saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : 'não disponível';
    const cofrinho = usuarioAtual ? 'R$ ' + (usuarioAtual.cofrinho || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2}) : 'R$ 0,00';
    const modoRua = configSeguranca.modoRua ? 'ATIVADO' : 'desativado';
    const alertaNoturno = configSeguranca.alertaNoturno ? 'ativado' : 'desativado';
    const limitePix = configSeguranca.limitePix ? `ativado (R$ ${configSeguranca.limitePixValor})` : 'desativado';
    const gastoHoje = 'R$ ' + configSeguranca.pixGastoHoje.toFixed(2);

    return `Você é a NANICA 🍌, a assistente virtual do Nupenca Bank — um banco digital brasileiro com tema de banana.

PERSONALIDADE:
- Simpática, divertida e profissional
- Use emojis (especialmente 🍌) com moderação  
- Fale em português brasileiro informal mas respeitoso
- Seja concisa (máximo 3-4 frases por resposta)
- Quando não souber algo específico do banco, seja honesta

DADOS DO CLIENTE LOGADO:
- Nome: ${nome}
- Saldo em conta: ${saldo}
- Cofrinho das Bananas: ${cofrinho}
- Modo Rua: ${modoRua}
- Alerta Noturno (19h-5h): ${alertaNoturno}
- Limite Pix diário: ${limitePix}
- Pix gasto hoje: ${gastoHoje}

FUNCIONALIDADES DO NUPENCA BANK:
- Pix (transferência instantânea com 4 camadas de segurança)
- Pagamento de boletos
- Cofrinho das Bananas (guardar/resgatar dinheiro separado)
- Empréstimo Cacho (até R$ 12.000, taxa 1,99%/mês, até 36x)
- Cartão virtual Premium Gold e Black/VIP (VISA) com efeito 3D
- Histórico de acessos com IP e dispositivo
- Tema claro/escuro

SEGURANÇA (4 camadas para Pix):
1. Confirmação de senha antes de cada Pix
2. Alerta de gasto noturno (19h às 5h)
3. Limite diário de Pix (configurável até R$ 2.000)
4. Modo Rua (bloqueia todas transações e NFC)

REGRAS:
- NUNCA invente dados financeiros, use apenas os dados fornecidos acima
- Se perguntarem algo fora do contexto bancário, responda brevemente e redirecione
- Não revele informações sensíveis como senhas ou chaves de API
- Sempre responda em português brasileiro`;
}

async function processarNanica(pergunta) {
    const typing = document.getElementById('nanica-typing');
    const msgsArea = document.getElementById('nanica-messages');
    typing.classList.add('active');
    msgsArea.scrollTop = msgsArea.scrollHeight;

    // Adiciona ao histórico (formato OpenAI)
    nanicaHistorico.push({ role: 'user', content: pergunta });

    // Limitar histórico a 20 mensagens
    if (nanicaHistorico.length > 20) {
        nanicaHistorico = nanicaHistorico.slice(-20);
    }

    try {
        const messages = [
            { role: 'system', content: getSystemPromptNanica() },
            ...nanicaHistorico
        ];

        const response = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: messages,
                temperature: 0.7,
                max_tokens: 300,
            })
        });

        if (!response.ok) throw new Error('API Error: ' + response.status);

        const data = await response.json();
        const resposta = data.choices?.[0]?.message?.content || 'Ops, não consegui responder agora 🍌';

        nanicaHistorico.push({ role: 'assistant', content: resposta });

        typing.classList.remove('active');
        adicionarMsgNanica(resposta);
    } catch (erro) {
        console.error('Erro Groq:', erro);
        typing.classList.remove('active');
        // Fallback para FAQ local
        const respostaLocal = gerarRespostaFallback(pergunta.toLowerCase());
        nanicaHistorico.push({ role: 'assistant', content: respostaLocal });
        adicionarMsgNanica(respostaLocal);
    }
}

// Fallback completo caso a API falhe
function gerarRespostaFallback(p) {
    if (p.includes('saldo') || p.includes('quanto tenho') || p.includes('dinheiro')) {
        if (usuarioAtual) return `Seu saldo atual é de **R$ ${usuarioAtual.saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}** 🍌💰`;
        return 'Você precisa estar logado para eu ver seu saldo! 🍌';
    }
    if (p.includes('cofrinho') || p.includes('guardar') || p.includes('poupar')) {
        const cof = usuarioAtual?.cofrinho || 0;
        return `O **Cofrinho das Bananas** 🧺 tem **R$ ${cof.toLocaleString('pt-BR', {minimumFractionDigits: 2})}**. Acesse pelo botão "Cofrinho" no dashboard!`;
    }
    if (p.includes('pix') || p.includes('transfer'))
        return 'Para fazer **Pix** 🔑, clique no botão "Pix" no dashboard. Protegido por 4 camadas de segurança!';
    if (p.includes('modo rua') || p.includes('bloqueio') || p.includes('nfc'))
        return `**Modo Rua** 🛡️ está ${configSeguranca.modoRua ? '**ATIVADO** 🔴' : '**desativado** 🟢'}. Ative pelo botão "Modo Rua" no dashboard.`;
    if (p.includes('noturn') || p.includes('noite'))
        return `**Alerta Noturno** 🌙 está ${configSeguranca.alertaNoturno ? 'ativado' : 'desativado'}. Protege entre 19h e 5h!`;
    if (p.includes('limit') || p.includes('diario') || p.includes('diário'))
        return `**Limite Diário** 📊: R$ ${configSeguranca.limitePixValor}. Gasto hoje: R$ ${configSeguranca.pixGastoHoje.toFixed(2)}`;
    if (p.includes('emprest') || p.includes('crédito') || p.includes('credito'))
        return '**Empréstimo Cacho** 💛: até R$ 12.000, taxa 1,99%/mês em até 36x!';
    if (p.includes('boleto') || p.includes('pagar'))
        return 'Para **pagar um boleto** 📄, clique em "Pagar" no dashboard!';
    if (p.includes('cartão') || p.includes('cartao') || p.includes('visa'))
        return 'Seu **Cartão Premium Nupenca** 💳 aparece no dashboard com efeito 3D!';
    if (p.includes('extrato') || p.includes('historico') || p.includes('histórico'))
        return 'Clique em **"Extrato"** 📋 no dashboard para ver suas movimentações!';
    if (p.includes('segurança') || p.includes('seguranca') || p.includes('proteg'))
        return 'Nupenca tem **4 camadas de segurança** 🔒: Senha Pix, Alerta Noturno, Limite Diário e Modo Rua!';
    if (p.includes('oi') || p.includes('olá') || p.includes('ola') || p.includes('bom dia') || p.includes('boa tarde') || p.includes('boa noite')) {
        const nome = usuarioAtual ? usuarioAtual.nome.split(' ')[0] : 'amigo(a)';
        return `Oiii, ${nome}! 🍌 Tudo banana? Como posso te ajudar?`;
    }
    if (p.includes('obrigad') || p.includes('valeu'))
        return 'Por nada! 🍌 Estou sempre aqui. Qualquer coisa, é só chamar! 💛';
    if (p.includes('ajuda') || p.includes('quem') || p.includes('nanica') || p.includes('voce') || p.includes('você'))
        return 'Eu sou a **Nanica** 🍌, sua assistente virtual do Nupenca Bank! Pergunte sobre saldo, Pix, segurança e mais!';
    return '🍌 Estou com dificuldade de me conectar à I.A. agora. Mas posso te ajudar com: **Saldo**, **Pix**, **Cofrinho**, **Modo Rua**, **Segurança**, **Empréstimo** ou **Cartão**!';
}

// ════════════════════════════
// ATIVANDO FUNÇÕES NO WINDOW OBJECT PELA ESTRUTURA `type="module"`
// ════════════════════════════
window.mostrarTela = mostrarTela;
window.irParaCadastro = irParaCadastro;
window.irParaLogin = irParaLogin;
window.fazerLogin = fazerLogin;
window.fazerLogout = fazerLogout;
window.recuperarSenha = recuperarSenha;
window.fazerCadastro = fazerCadastro;
window.toggleSaldo = toggleSaldo;
window.toggleTheme = toggleTheme;
window.abrirPainel = abrirPainel;
window.fecharPainel = fecharPainel;
window.abrirPainelConfig = abrirPainelConfig;
window.guardarNoCofrinho = guardarNoCofrinho;
window.resgatarDoCofrinho = resgatarDoCofrinho;
window.realizarPix = realizarPix;
window.pagarBoleto = pagarBoleto;
window.simularEmprestimo = simularEmprestimo;
window.solicitarEmprestimo = solicitarEmprestimo;
window.mascaraCPF = mascaraCPF;
window.mascaraCEP = mascaraCEP;
window.mascaraMoeda = mascaraMoeda;
window.abrirPainelHistorico = abrirPainelHistorico;
window.filtrarAcessos = filtrarAcessos;
// Novas features
window.toggleModoRua = toggleModoRua;
window.toggleAlertaNoturno = toggleAlertaNoturno;
window.toggleLimitePix = toggleLimitePix;
window.salvarLimitePix = salvarLimitePix;
window.confirmarSenhaPix = confirmarSenhaPix;
window.fecharModalSenha = fecharModalSenha;
window.confirmarNoturno = confirmarNoturno;
window.cancelarNoturno = cancelarNoturno;
window.toggleNanica = toggleNanica;
window.enviarMsgNanica = enviarMsgNanica;
window.enviarChipNanica = enviarChipNanica;
window.abrirPainelModoRua = abrirPainelModoRua;
window.atualizarSliderLimite = atualizarSliderLimite;
window.aplicarTipoCartao = aplicarTipoCartao;
