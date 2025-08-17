document.addEventListener('DOMContentLoaded', () => {
    // --- Nova funcionalidade: Gerenciamento de Instâncias ---
    const currentInstanceId = document.body.dataset.instanceId || 'pico7f';
    console.log(`[DEBUG] Página carregada para a instância: ${currentInstanceId}`);

    // Adiciona classe 'active' ao botão de navegação da instância atual
    document.querySelectorAll('.nav-button').forEach(button => {
        if (button.href.includes(currentInstanceId) || (currentInstanceId === 'pico7f' && button.href.endsWith('index.html'))) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // Referências aos elementos HTML
    const redBossListContainer = document.getElementById('redBossListContainer');
    const yellowBossListContainer = document.getElementById('yellowBossListContainer');
    const cyanBossListContainer = document.getElementById('cyanBossListContainer');
    const resourceListContainer = document.getElementById('resourceListContainer');
    const actionLogList = document.getElementById('actionLog');
    const nicknameInput = document.getElementById('nicknameInput');
    const reserveEntryBtn = document.getElementById('reserveEntryBtn');
    const reservationStatus = document.getElementById('reservationStatus');

    // --- Função: Calcula o próximo horário de spawn fixo para bosses vermelhos ---
    function calculateNextSpecificSpawnTime(dailySpawnTimes) {
        const now = new Date();
        let nextSpawnMs = null;

        for (const timeStr of dailySpawnTimes) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            const spawnCandidate = new Date(now);
            spawnCandidate.setHours(hours, minutes, 0, 0);

            if (spawnCandidate.getTime() >= now.getTime()) {
                if (!nextSpawnMs || spawnCandidate.getTime() < nextSpawnMs) {
                    nextSpawnMs = spawnCandidate.getTime();
                }
            }
        }

        if (nextSpawnMs && nextSpawnMs >= now.getTime()) {
            return nextSpawnMs;
        } else {
            const firstSpawnTomorrow = new Date(now);
            firstSpawnTomorrow.setDate(now.getDate() + 1);
            const [hours, minutes] = dailySpawnTimes[0].split(':').map(Number);
            firstSpawnTomorrow.setHours(hours, minutes, 0, 0);
            return firstSpawnTomorrow.getTime();
        }
    }

    // --- Dados de TODOS os Itens (Bosses e Recursos) ---
    const items = {
        red: [
            { id: 'red-boss-1', name: 'Red Norte', type: 'red', dailySpawnTimes: ['04:00', '10:00', '16:00', '22:00'], icon: '👹' },
            { id: 'red-boss-2', name: 'Red Sul', type: 'red', dailySpawnTimes: ['01:00', '07:00', '13:00', '19:00'], icon: '🔱' },
        ],
        yellow: [
            { id: 'yellow-boss-1', name: 'Amarelo Esquerdo', type: 'yellow', respawnTime: 60 * 60 * 1000, icon: '👺' },
            { id: 'yellow-boss-2', name: 'Amarelo Direito', type: 'yellow', respawnTime: 60 * 60 * 1000, icon: '🦁' },
        ],
        cyan: [
            { id: 'cyan-boss-1', name: 'Azul 1', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '💧' },
            { id: 'cyan-boss-2', name: 'Azul 2', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '🔵' },
            { id: 'cyan-boss-3', name: 'Azul 3', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '❄️' },
            { id: 'cyan-boss-4', name: 'Azul 4', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '🧊' }
        ],
        resource: [
            { id: 'resource-ore', name: 'Minério Lendário', type: 'resource', respawnTime: 60 * 60 * 1000, icon: '✨' },
            { id: 'resource-plant', name: 'Planta Lendária', type: 'resource', respawnTime: 60 * 60 * 1000, icon: '🌿' },
        ]
    };

    let itemStates = {}; // Estado dos timers para todos os itens (agora sincronizado com Firestore)
    let userReservation = { nickname: '', reservationUntil: null }; // Continua local
    let actionLog = []; // Histórico de ações (sincronizado com Firestore)

    // --- Funções de Utilitário ---
    function formatTime(ms) {
        if (ms < 0) ms = 0;
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function formatDateTime(timestamp) {
        return new Date(timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
    }

    // --- Persistência de Dados (Firestore e localStorage para Nickname/Reserva Local) ---

    // Carrega o nickname e a reserva do localStorage (mantidos locais)
    function loadLocalData() {
        const savedUserReservation = localStorage.getItem(`bossTracker_${currentInstanceId}_userReservation`);
        const lastNickname = localStorage.getItem(`bossTracker_lastNickname`);

        if (savedUserReservation) {
            userReservation = JSON.parse(savedUserReservation);
        }
        if (lastNickname) {
            nicknameInput.value = lastNickname;
        }
        // Salva para garantir que qualquer inicialização ou ajuste local seja persistido
        saveLocalData();
    }

    // Salva o nickname e a reserva no localStorage (mantidos locais)
    function saveLocalData() {
        localStorage.setItem(`bossTracker_${currentInstanceId}_userReservation`, JSON.stringify(userReservation));
        localStorage.setItem(`bossTracker_lastNickname`, nicknameInput.value);
    }

    // Função para inicializar os estados dos itens para uma nova instância no Firestore
    async function initializeInstanceStatesInFirestore() {
        if (!window.db) {
            console.error('ERRO: Firebase não inicializado.');
            return;
        }
        const instanceRef = window.firebaseDoc(window.db, 'instanceStates', currentInstanceId);
        const initialStates = {};
        const allItemsFlat = [...items.red, ...items.yellow, ...items.cyan, ...items.resource];

        allItemsFlat.forEach(item => {
            if (item.type === 'red') {
                initialStates[item.id] = { lastActionTime: null, nextSpawnTime: calculateNextSpecificSpawnTime(item.dailySpawnTimes) };
            } else {
                initialStates[item.id] = { lastActionTime: null, nextSpawnTime: Date.now() }; // Inicia como 'ativo'
            }
        });

        try {
            await window.firebaseSetDoc(instanceRef, initialStates);
            console.log(`[DEBUG] Estados iniciais da instância ${currentInstanceId} criados no Firestore.`);
            return initialStates;
        } catch (error) {
            console.error(`Erro ao criar estados iniciais da instância ${currentInstanceId} no Firestore:`, error);
            return null; // Indica falha
        }
    }

    // Função para carregar os estados dos itens do Firestore
    async function loadItemStatesFromFirestore() {
        if (!window.db) {
            console.error('ERRO: Firebase não inicializado.');
            return null;
        }
        const instanceRef = window.firebaseDoc(window.db, 'instanceStates', currentInstanceId);
        try {
            const docSnap = await window.firebaseGetDoc(instanceRef);
            if (docSnap.exists()) {
                console.log(`[DEBUG] Estados da instância ${currentInstanceId} carregados do Firestore.`);
                return docSnap.data();
            } else {
                console.log(`[DEBUG] Documento da instância ${currentInstanceId} não encontrado no Firestore. Inicializando.`);
                return await initializeInstanceStatesInFirestore();
            }
        } catch (error) {
            console.error(`Erro ao carregar estados da instância ${currentInstanceId} do Firestore:`, error);
            // Em caso de erro, inicializa localmente como fallback (se necessário, ou trata erro de forma mais robusta)
            return null; 
        }
    }

    // Função para atualizar o estado de um item específico no Firestore
    async function updateItemStateInFirestore(itemId, newState) {
        if (!window.db) {
            console.error('ERRO: Firebase não inicializado.');
            return;
        }
        const instanceRef = window.firebaseDoc(window.db, 'instanceStates', currentInstanceId);
        try {
            // Usa updateDoc para atualizar apenas o campo específico dentro do documento da instância
            await window.firebaseUpdateDoc(instanceRef, {
                [itemId]: newState // Ex: { "red-boss-1": { lastActionTime: ..., nextSpawnTime: ... } }
            });
            console.log(`[DEBUG] Estado do item ${itemId} atualizado no Firestore para instância ${currentInstanceId}.`);
        } catch (error) {
            console.error(`Erro ao atualizar estado do item ${itemId} no Firestore:`, error);
        }
    }


    async function fetchActionLogFromFirestore() {
        if (!window.db) {
            console.error('ERRO: Firebase não inicializado.');
            actionLogList.innerHTML = '<li>Erro: Firebase não configurado.</li>';
            return;
        }
        try {
            console.log(`[DEBUG] Buscando ações para a instância: ${currentInstanceId}`);
            const actionsCol = window.firebaseCollection(window.db, 'actions');
            const q = window.firebaseQuery(
                actionsCol,
                window.firebaseWhere('instanceId', '==', currentInstanceId),
                window.firebaseOrderBy('timestamp', 'desc')
            );

            const querySnapshot = await window.firebaseGetDocs(q);
            actionLog = [];
            if (querySnapshot.empty) {
                console.log(`[DEBUG] Nenhuma ação encontrada no Firestore para a instância: ${currentInstanceId}`);
            }
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                console.log(`[DEBUG] Ação carregada do Firestore: ${data.itemName} (Instância: ${data.instanceId}, Usuário: ${data.user})`);
                actionLog.push({
                    itemId: data.itemId,
                    itemName: data.itemName,
                    user: data.user,
                    actionType: data.actionType || 'kill',
                    time: data.timestamp ? data.timestamp.toMillis() : Date.now(),
                    instanceId: data.instanceId
                });
            });
            renderActionLog();
        } catch (error) {
            console.error('Erro ao buscar histórico do Firestore:', error);
            actionLogList.innerHTML = '<li>Erro ao carregar histórico do Firebase.</li>';
        }
    }

    async function sendItemActionToFirestore(actionData) {
        if (!window.db) {
            console.error('ERRO: Firebase não inicializado. A ação não será registrada.');
            alert('Erro: Firebase não configurado. A ação não será registrada centralmente.');
            return;
        }
        try {
            const actionsCol = window.firebaseCollection(window.db, 'actions');
            await window.firebaseAddDoc(actionsCol, {
                itemName: actionData.itemName,
                user: actionData.user,
                itemId: actionData.itemId,
                itemType: actionData.itemType,
                actionType: actionData.actionType,
                instanceId: currentInstanceId,
                timestamp: new Date()
            });
            console.log(`[DEBUG] Ação (${actionData.actionType}) registrada no Firestore para a instância ${currentInstanceId} com sucesso!`);
            await fetchActionLogFromFirestore();
        } catch (error) {
            console.error('Erro ao registrar ação no Firestore:', error);
            alert('Erro de conexão ao registrar ação no Firebase. Verifique sua internet ou console.');
        }
    }

    // --- Renderização da UI ---
    function renderItemLists() {
        redBossListContainer.innerHTML = '';
        yellowBossListContainer.innerHTML = '';
        cyanBossListContainer.innerHTML = '';
        resourceListContainer.innerHTML = '';

        const renderItemCard = (item) => {
            const itemCard = document.createElement('div');
            itemCard.classList.add('item-card', item.type);
            itemCard.dataset.itemId = item.id;

            const itemState = itemStates[item.id]; // Agora 'itemStates' vem do Firestore
            const now = Date.now();
            let statusText = '';
            let nextSpawnDisplay = '';
            let lastActionDisplay = '';
            let buttonHtml = '';

            if (item.type === 'red') {
                let currentNextSpawnTime = itemState ? itemState.nextSpawnTime : calculateNextSpecificSpawnTime(item.dailySpawnTimes);
                if (currentNextSpawnTime <= now) {
                    statusText = 'Ativo';
                    nextSpawnDisplay = `Próximo spawn fixo: ${formatDateTime(calculateNextSpecificSpawnTime(item.dailySpawnTimes))}`;
                } else {
                    const timeLeft = currentNextSpawnTime - now;
                    statusText = `Ativo em: ${formatTime(timeLeft)}`;
                    nextSpawnDisplay = `Próximo spawn fixo: ${formatDateTime(currentNextSpawnTime)}`;
                }
            } else { // Yellow, Cyan, or Resource
                if (!itemState || !itemState.lastActionTime || itemState.nextSpawnTime <= now) {
                    statusText = 'Ativo';
                    buttonHtml = `<button class="action-button ${item.type === 'resource' ? 'collect-button' : 'kill-button'}" data-item-id="${item.id}" data-action-type="${item.type === 'resource' ? 'collected' : 'kill'}">${item.type === 'resource' ? 'Coletado' : 'Matar'}</button>`;
                } else {
                    const timeLeft = itemState.nextSpawnTime - now;
                    statusText = `${item.type === 'resource' ? 'Respawn' : 'Respawn'} em: ${formatTime(timeLeft)}`;
                    buttonHtml = `<button class="action-button ${item.type === 'resource' ? 'collect-button' : 'kill-button'}" data-item-id="${item.id}" data-action-type="${item.type === 'resource' ? 'collected' : 'kill'}" disabled>${item.type === 'resource' ? 'Coletado' : 'Matar'}</button>`;
                    lastActionDisplay = `Última ${item.type === 'resource' ? 'coleta' : 'morte'}: ${formatDateTime(itemState.lastActionTime)}`;
                    nextSpawnDisplay = `Respawn estimado: ${formatDateTime(itemState.nextSpawnTime)}`;
                }
            }

            itemCard.innerHTML = `
                <h3>${item.name} ${item.icon}</h3>
                <p>Tipo: <span style="color: ${item.type === 'red' ? 'red' : item.type === 'yellow' ? 'gold' : item.type === 'cyan' ? 'cyan' : 'purple'};">${item.type.toUpperCase()}</span></p>
                <p class="status-text">${statusText}</p>
                ${lastActionDisplay ? `<p class="action-time">${lastActionDisplay}</p>` : ''}
                ${nextSpawnDisplay ? `<p class="action-time">${nextSpawnDisplay}</p>` : ''}
                ${buttonHtml}
            `;
            return itemCard;
        };

        items.red.forEach(item => redBossListContainer.appendChild(renderItemCard(item)));
        items.yellow.forEach(item => yellowBossListContainer.appendChild(renderItemCard(item)));
        items.cyan.forEach(item => cyanBossListContainer.appendChild(renderItemCard(item)));
        items.resource.forEach(item => resourceListContainer.appendChild(renderItemCard(item)));

        document.querySelectorAll('.action-button').forEach(button => {
            button.onclick = (event) => {
                event.stopPropagation();
                const itemId = button.dataset.itemId;
                const actionType = button.dataset.actionType;
                handleItemAction(itemId, actionType);
            };
        });
    }

    function renderActionLog() {
        actionLogList.innerHTML = '';
        console.log(`[DEBUG] Renderizando log para a instância: ${currentInstanceId}. Itens no log: ${actionLog.length}`);
        if (actionLog.length === 0) {
            actionLogList.innerHTML = '<li>Nenhum registro de ação para esta instância ainda.</li>';
            return;
        }
        actionLog.forEach(log => {
            const li = document.createElement('li');
            const verb = log.actionType === 'collected' ? 'coletado' : 'morto';
            li.innerHTML = `<strong>${log.itemName}</strong> ${verb} por <strong>${log.user || 'Desconhecido'}</strong> em ${formatDateTime(log.time)}`;
            actionLogList.appendChild(li);
        });
    }

    function updateReservationStatus() {
        const now = Date.now();
        if (userReservation.nickname && userReservation.reservationUntil > now) {
            const timeLeft = userReservation.reservationUntil - now;
            reservationStatus.textContent = `Sua reserva (${userReservation.nickname}): ${formatTime(timeLeft)}`;
            reservationStatus.style.color = '#f1c40f';
        } else {
            userReservation.nickname = '';
            userReservation.reservationUntil = null;
            reservationStatus.textContent = 'Nenhuma reserva ativa.';
            reservationStatus.style.color = '#bdc3c7';
            saveLocalData(); // Salva estado local da reserva
        }
    }

    // --- Manipuladores de Eventos ---
    reserveEntryBtn.addEventListener('click', () => {
        const nickname = nicknameInput.value.trim();
        if (nickname) {
            userReservation.nickname = nickname;
            userReservation.reservationUntil = Date.now() + (30 * 60 * 1000);
            saveLocalData(); // Salva estado local da reserva
            updateReservationStatus();
        } else {
            alert('Por favor, digite seu nickname para reservar.');
        }
    });

    async function handleItemAction(itemId, actionType) {
        let item = null;
        const allItemsFlat = [...items.red, ...items.yellow, ...items.cyan, ...items.resource];
        item = allItemsFlat.find(i => i.id === itemId);

        if (!item) return;

        const now = Date.now();
        const nickname = nicknameInput.value.trim() || 'Anônimo';

        // Atualiza o estado do item localmente
        if (item.type !== 'red') {
            itemStates[item.id] = { lastActionTime: now, nextSpawnTime: now + item.respawnTime };
        } else {
            // Para bosses vermelhos, só registra a ação, o nextSpawnTime é fixo e recalculado
            itemStates[item.id] = { lastActionTime: now, nextSpawnTime: calculateNextSpecificSpawnTime(item.dailySpawnTimes) };
        }

        // Envia o novo estado do item para o Firestore
        await updateItemStateInFirestore(item.id, itemStates[item.id]);

        // Envia a ação (kill/coleta) para o Firestore Actions Log
        const actionData = {
            itemName: item.name,
            user: nickname,
            itemId: item.id,
            itemType: item.type,
            actionType: actionType
        };
        await sendItemActionToFirestore(actionData); // Esta função já re-busca e re-renderiza o log.

        renderItemLists(); // Renderiza a lista de itens com os novos tempos
        updateReservationStatus();
    }


    // --- Loop de Atualização ---
    function updateUI() {
        renderItemLists();
        updateReservationStatus();
    }

    // --- Inicialização ---
    async function initializeApp() {
        loadLocalData(); // Carrega nickname e reserva do localStorage
        itemStates = await loadItemStatesFromFirestore(); // Carrega ou inicializa estados dos itens do Firestore
        updateUI(); // Renderiza a UI inicialmente

        setInterval(updateUI, 1000); // Atualiza os contadores a cada segundo
        setInterval(fetchActionLogFromFirestore, 60000); // Busca o histórico atualizado do Firebase a cada 1 minuto
    }

    initializeApp(); // Inicia a aplicação
});
