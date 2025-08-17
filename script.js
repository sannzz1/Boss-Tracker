document.addEventListener('DOMContentLoaded', () => {
    // --- Nova funcionalidade: Gerenciamento de Instâncias ---
    const currentInstanceId = document.body.dataset.instanceId || 'pico7f';
    console.log(`%c[APP START] Carregando aplicação para a instância: ${currentInstanceId}`, 'color: #1abc9c; font-weight: bold;');

    // Adiciona classe 'active' ao botão de navegação da instância atual
    document.querySelectorAll('.nav-button').forEach(button => {
        // Correção para index.html / pico7f.html para que o botão 'Pico 7F' seja ativo quando o arquivo for index.html
        const isCurrentFileIndex = window.location.pathname.endsWith('index.html') || window.location.pathname === '/';
        const isButtonForCurrentInstance = (button.href.includes(currentInstanceId)) || (currentInstanceId === 'pico7f' && isCurrentFileIndex && button.href.endsWith('index.html'));

        if (isButtonForCurrentInstance) {
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
    // ESTA LISTA É A DEFINIÇÃO DOS BOSSES, É GLOBAL E COMPARTILHADA POR TODAS AS INSTÂNCIAS.
    // APENAS SEUS ESTADOS (timers, quem matou) SÃO INDIVIDUAIS POR INSTÂNCIA.
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
            console.log(`%c[LOCAL] Reserva local para ${currentInstanceId} carregada:`, 'color: #9b59b6;', userReservation);
        }
        if (lastNickname) {
            nicknameInput.value = lastNickname;
            console.log(`%c[LOCAL] Nickname local carregado: ${lastNickname}`, 'color: #9b59b6;');
        }
        // Salva para garantir que qualquer inicialização ou ajuste local seja persistido
        saveLocalData();
    }

    // Salva o nickname e a reserva no localStorage (mantidos locais)
    function saveLocalData() {
        localStorage.setItem(`bossTracker_${currentInstanceId}_userReservation`, JSON.stringify(userReservation));
        localStorage.setItem(`bossTracker_lastNickname`, nicknameInput.value);
        console.log(`%c[LOCAL] Dados locais salvos para instância: ${currentInstanceId}`, 'color: #9b59b6;');
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
            console.log(`%c[DB INIT] Estados iniciais da instância ${currentInstanceId} CRIADOS no Firestore.`, 'color: #f39c12;');
            return initialStates;
        } catch (error) {
            console.error(`%c[DB INIT ERROR] Erro ao criar estados iniciais da instância ${currentInstanceId} no Firestore:`, 'color: #e74c3c;', error);
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
                const loadedStates = docSnap.data();
                console.log(`%c[DB LOAD] Estados da instância ${currentInstanceId} CARREGADOS do Firestore:`, 'color: #2ecc71;', loadedStates);
                return loadedStates;
            } else {
                console.log(`%c[DB LOAD] Documento da instância ${currentInstanceId} NÃO ENCONTRADO no Firestore. Inicializando.`, 'color: #f1c40f;');
                return await initializeInstanceStatesInFirestore();
            }
        } catch (error) {
            console.error(`%c[DB LOAD ERROR] Erro ao carregar estados da instância ${currentInstanceId} do Firestore:`, 'color: #e74c3c;', error);
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
            await window.firebaseUpdateDoc(instanceRef, {
                [itemId]: newState
            });
            console.log(`%c[DB UPDATE] Estado do item ${itemId} ATUALIZADO no Firestore para instância ${currentInstanceId}. Novo estado:`, 'color: #3498db;', newState);
        } catch (error) {
            console.error(`%c[DB UPDATE ERROR] Erro ao atualizar estado do item ${itemId} no Firestore:`, 'color: #e74c3c;', error);
        }
    }

    async function fetchActionLogFromFirestore() {
        if (!window.db) {
            console.error('ERRO: Firebase não inicializado.');
            actionLogList.innerHTML = '<li>Erro: Firebase não configurado.</li>';
            return;
        }
        try {
            console.log(`%c[LOG FETCH] Buscando ações para a instância: ${currentInstanceId} no Firestore.`, 'color: #8e44ad;');
            const actionsCol = window.firebaseCollection(window.db, 'actions');
            const q = window.firebaseQuery(
                actionsCol,
                window.firebaseWhere('instanceId', '==', currentInstanceId),
                window.firebaseOrderBy('timestamp', 'desc')
            );

            const querySnapshot = await window.firebaseGetDocs(q);
            actionLog = [];
            if (querySnapshot.empty) {
                console.log(`%c[LOG FETCH] Nenhuma ação encontrada no Firestore para a instância: ${currentInstanceId}.`, 'color: #8e44ad;');
            }
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                actionLog.push({
                    itemId: data.itemId,
                    itemName: data.itemName,
                    user: data.user,
                    actionType: data.actionType || 'kill',
                    time: data.timestamp ? data.timestamp.toMillis() : Date.now(),
                    instanceId: data.instanceId
                });
            });
            console.log(`%c[LOG FETCH] ${actionLog.length} ações carregadas para a instância ${currentInstanceId}.`, 'color: #8e44ad;');
            renderActionLog();
        } catch (error) {
            console.error(`%c[LOG FETCH ERROR] Erro ao buscar histórico do Firestore:`, 'color: #e74c3c;', error);
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
            console.log(`%c[LOG SEND] Ação (${actionData.actionType}) registrada no Firestore para a instância ${currentInstanceId} com sucesso!`, 'color: #27ae60;');
            await fetchActionLogFromFirestore(); // Re-busca e re-renderiza o log após o registro
        } catch (error) {
            console.error(`%c[LOG SEND ERROR] Erro ao registrar ação no Firestore:`, 'color: #e74c3c;', error);
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

            // Pega o estado do item do objeto itemStates carregado do Firestore
            const itemState = itemStates[item.id]; 
            const now = Date.now();
            let statusText = '';
            let nextSpawnDisplay = '';
            let lastActionDisplay = '';
            let buttonHtml = '';

            // Lógica para boss vermelho (spawn fixo)
            if (item.type === 'red') {
                // Se não há estado salvo ou o tempo de spawn passou, recalcula
                let currentNextSpawnTime = itemState && itemState.nextSpawnTime > now ?
                                          itemState.nextSpawnTime : calculateNextSpecificSpawnTime(item.dailySpawnTimes);
                
                // Força o itemState a refletir o tempo de spawn atual na UI
                // Apenas se o estado carregado for diferente ou não existir
                if (!itemState || itemState.nextSpawnTime !== currentNextSpawnTime) {
                    itemStates[item.id] = { 
                        lastActionTime: itemState ? itemState.lastActionTime : null, 
                        nextSpawnTime: currentNextSpawnTime 
                    };
                    // Não salva no Firestore aqui para evitar loop infinito,
                    // a atualização do Firestore ocorre apenas no handleItemAction
                }

                if (currentNextSpawnTime <= now) {
                    statusText = 'Ativo';
                    nextSpawnDisplay = `Próximo spawn fixo: ${formatDateTime(calculateNextSpecificSpawnTime(item.dailySpawnTimes))}`;
                } else {
                    const timeLeft = currentNextSpawnTime - now;
                    statusText = `Ativo em: ${formatTime(timeLeft)}`;
                    nextSpawnDisplay = `Próximo spawn fixo: ${formatDateTime(currentNextSpawnTime)}`;
                }
            } else { // Yellow, Cyan, or Resource (spawn baseado na última morte/coleta)
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
        console.log(`%c[UI RENDER] Renderizando cards para a instância: ${currentInstanceId}. Estados usados:`, 'color: #1abc9c;', itemStates);
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
        console.log(`%c[LOG RENDER] Renderizando log para a instância: ${currentInstanceId}. Itens no log: ${actionLog.length}`, 'color: #8e44ad;');
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
            saveLocalData();
        }
    }

    // --- Manipuladores de Eventos ---
    reserveEntryBtn.addEventListener('click', () => {
        const nickname = nicknameInput.value.trim();
        if (nickname) {
            userReservation.nickname = nickname;
            userReservation.reservationUntil = Date.now() + (30 * 60 * 1000);
            saveLocalData();
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

        let newItemState;
        if (item.type !== 'red') {
            newItemState = { lastActionTime: now, nextSpawnTime: now + item.respawnTime };
        } else {
            // Para bosses vermelhos, o tempo de spawn é fixo, não baseado na 'morte'
            newItemState = { lastActionTime: now, nextSpawnTime: calculateNextSpecificSpawnTime(item.dailySpawnTimes) };
        }
        
        // Atualiza o objeto itemStates local ANTES de enviar para o Firestore
        // Isso garante que a UI reflita a mudança imediatamente, mesmo antes da atualização do Firestore
        itemStates[item.id] = newItemState;
        console.log(`%c[ACTION] Item ${itemId} acionado. Novo estado local:`, 'color: #27ae60;', newItemState);


        // Envia o novo estado do item para o Firestore
        await updateItemStateInFirestore(item.id, newItemState);

        // Envia a ação (kill/coleta) para o Firestore Actions Log
        const actionData = {
            itemName: item.name,
            user: nickname,
            itemId: item.id,
            itemType: item.type,
            actionType: actionType
        };
        await sendItemActionToFirestore(actionData);

        renderItemLists(); // Re-renderiza a lista de itens com os novos tempos
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
        
        // Carrega ou inicializa estados dos itens do Firestore
        // itemStates será o objeto retornado por loadItemStatesFromFirestore
        const loadedStates = await loadItemStatesFromFirestore(); 
        if (loadedStates) {
            itemStates = loadedStates;
        } else {
            // Caso a carga do Firestore falhe e initializeInstanceStatesInFirestore também falhe
            // (o que não deveria acontecer se o Firebase estiver configurado e regras ok)
            // itemStates já foi inicializado como {}, mas podemos garantir default values
            console.warn("[INIT] Falha na carga do Firestore. Inicializando itemStates com defaults internos.");
            const allItemsFlat = [...items.red, ...items.yellow, ...items.cyan, ...items.resource];
            allItemsFlat.forEach(item => {
                if (!itemStates[item.id]) { // Apenas inicializa se não veio do Firestore
                    if (item.type === 'red') {
                        itemStates[item.id] = { lastActionTime: null, nextSpawnTime: calculateNextSpecificSpawnTime(item.dailySpawnTimes) };
                    } else {
                        itemStates[item.id] = { lastActionTime: null, nextSpawnTime: Date.now() };
                    }
                }
            });
        }
        console.log(`%c[INIT] itemStates após carga/inicialização para ${currentInstanceId}:`, 'color: #1abc9c;', itemStates);
        
        updateUI(); // Renderiza a UI inicialmente

        // Adiciona um listener para atualizações em tempo real do Firestore para itemStates
        if (window.db && window.onSnapshot && window.firebaseDoc) { // Garante que onSnapshot está disponível
            const instanceRef = window.firebaseDoc(window.db, 'instanceStates', currentInstanceId);
            window.onSnapshot(instanceRef, (docSnap) => {
                if (docSnap.exists()) {
                    const newStates = docSnap.data();
                    // Compara os estados para evitar renderizações desnecessárias e loops
                    if (JSON.stringify(itemStates) !== JSON.stringify(newStates)) {
                        itemStates = newStates;
                        console.log(`%c[REALTIME] Estados da instância ${currentInstanceId} ATUALIZADOS EM TEMPO REAL.`, 'color: #9b59b6;');
                        updateUI();
                    } else {
                        console.log(`%c[REALTIME] Sem mudanças detectadas para ${currentInstanceId}, ignorando atualização.`, 'color: #9b59b6; opacity: 0.6;');
                    }
                } else {
                    // Documento não existe mais no Firestore, possivelmente apagado
                    console.warn(`%c[REALTIME] Documento da instância ${currentInstanceId} não existe mais no Firestore!`, 'color: #e74c3c;');
                    // Pode-se re-inicializar ou mostrar um estado de erro
                }
            }, (error) => {
                console.error(`%c[REALTIME ERROR] Erro ao configurar listener em tempo real para itemStates:`, 'color: #e74c3c;', error);
            });
        } else {
            console.warn("Firestore onSnapshot ou firebaseDoc não estão disponíveis. Atualizações em tempo real desativadas.");
        }


        setInterval(updateUI, 1000); // Atualiza os contadores a cada segundo
        // O fetchActionLogFromFirestore já é chamado após cada sendItemActionToFirestore
        // e na inicialização. Um intervalo separado pode ser mantido para garantir sincronia,
        // mas o realtime updates para actionLog seria uma feature mais avançada.
        // Por enquanto, 1 minuto para o log é um bom equilíbrio.
        setInterval(fetchActionLogFromFirestore, 60000); // Busca o histórico atualizado do Firebase a cada 1 minuto
    }

    initializeApp(); // Inicia a aplicação
});
