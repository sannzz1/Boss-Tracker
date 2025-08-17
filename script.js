document.addEventListener('DOMContentLoaded', () => {
    // --- Nova funcionalidade: Gerenciamento de Instâncias ---
    const currentInstanceId = document.body.dataset.instanceId || 'pico7f'; // Pega o ID da instância do HTML
    const instanceSelector = document.getElementById('instanceSelector');
    const goToInstanceBtn = document.getElementById('goToInstanceBtn');
    const actionLogList = document.getElementById('actionLog'); // ID do log agora é actionLog

    // Define o seletor para a instância atual
    if (instanceSelector) {
        instanceSelector.value = currentInstanceId;
        goToInstanceBtn.addEventListener('click', () => {
            const selectedInstance = instanceSelector.value;
            if (selectedInstance !== currentInstanceId) {
                // Redireciona para o arquivo HTML correspondente
                window.location.href = `${selectedInstance}.html`;
            }
        });
    }

    // Referências aos elementos HTML (restante)
    const redBossListContainer = document.getElementById('redBossListContainer');
    const yellowBossListContainer = document.getElementById('yellowBossListContainer');
    const cyanBossListContainer = document.getElementById('cyanBossListContainer');
    const resourceListContainer = document.getElementById('resourceListContainer');
    const nicknameInput = document.getElementById('nicknameInput');
    const reserveEntryBtn = document.getElementById('reserveEntryBtn');
    const reservationStatus = document.getElementById('reservationStatus');
    // Botão de Reiniciar Tudo foi removido

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
            { id: 'cyan-boss-2', name: 'Azul 2', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '��' },
            { id: 'cyan-boss-3', name: 'Azul 3', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '❄️' },
            { id: 'cyan-boss-4', name: 'Azul 4', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '🧊' }
        ],
        resource: [
            { id: 'resource-ore', name: 'Minério Lendário', type: 'resource', respawnTime: 60 * 60 * 1000, icon: '✨' },
            { id: 'resource-plant', name: 'Planta Lendária', type: 'resource', respawnTime: 60 * 60 * 1000, icon: '🌿' },
        ]
    };

    let itemStates = {}; // Estado dos timers para todos os itens
    let userReservation = { nickname: '', reservationUntil: null };
    let actionLog = []; // Histórico de ações (kills/coletas)

    // --- Funções de Utilitário ---
    function formatTime(ms) {
        if (ms < 0) ms = 0;
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Ajustado para formatar para o horário de Brasília (UTC-3)
    function formatDateTime(timestamp) {
        return new Date(timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
    }

    // --- Persistência de Dados Locais (localStorage) ---
    // Agora os dados locais são específicos da instância
    function saveData() {
        localStorage.setItem(`bossTracker_${currentInstanceId}_itemStates`, JSON.stringify(itemStates));
        localStorage.setItem(`bossTracker_${currentInstanceId}_userReservation`, JSON.stringify(userReservation));
        localStorage.setItem(`bossTracker_lastNickname`, nicknameInput.value); // Nickname pode ser compartilhado
    }

    async function loadData() {
        const savedItemStates = localStorage.getItem(`bossTracker_${currentInstanceId}_itemStates`);
        const savedUserReservation = localStorage.getItem(`bossTracker_${currentInstanceId}_userReservation`);
        const lastNickname = localStorage.getItem(`bossTracker_lastNickname`);

        const allItemsFlat = [...items.red, ...items.yellow, ...items.cyan, ...items.resource];

        if (savedItemStates) {
            itemStates = JSON.parse(savedItemStates);
            // Garante que novos itens sejam inicializados e itens removidos sejam limpos
            allItemsFlat.forEach(item => {
                if (!itemStates[item.id]) {
                    if (item.type === 'red') {
                        itemStates[item.id] = { lastActionTime: null, nextSpawnTime: calculateNextSpecificSpawnTime(item.dailySpawnTimes) };
                    } else {
                        itemStates[item.id] = { lastActionTime: null, nextSpawnTime: Date.now() };
                    }
                } else if (item.type === 'red') {
                    // Para itens vermelhos, recalcular nextSpawnTime se já passou
                    const currentNextSpawnTime = itemStates[item.id].nextSpawnTime;
                    const now = Date.now();
                    if (currentNextSpawnTime <= now) {
                        itemStates[item.id].nextSpawnTime = calculateNextSpecificSpawnTime(item.dailySpawnTimes);
                    }
                }
            });
            // Remove itens que não existem mais na lista 'items'
            for (const id in itemStates) {
                if (!allItemsFlat.some(item => item.id === id)) {
                    delete itemStates[id];
                }
            }
        } else {
            // Inicializa todos os itens pela primeira vez
            allItemsFlat.forEach(item => {
                if (item.type === 'red') {
                    itemStates[item.id] = { lastActionTime: null, nextSpawnTime: calculateNextSpecificSpawnTime(item.dailySpawnTimes) };
                } else {
                    itemStates[item.id] = { lastActionTime: null, nextSpawnTime: Date.now() };
                }
            });
        }

        if (savedUserReservation) {
            userReservation = JSON.parse(savedUserReservation);
        }
        if (lastNickname) {
            nicknameInput.value = lastNickname;
        }
        saveData();

        await fetchActionLogFromFirestore();
    }

    // --- Comunicação com Firebase Firestore ---

    async function fetchActionLogFromFirestore() {
        if (!window.db) {
            console.error('ERRO: Firebase não inicializado.');
            actionLogList.innerHTML = '<li>Erro: Firebase não configurado.</li>';
            return;
        }
        try {
            const killsCol = window.firebaseCollection(window.db, 'actions'); // Usando nova coleção 'actions'
            // Filtra o log pela instância atual
            const q = window.firebaseQuery(
                killsCol,
                window.firebaseWhere('instanceId', '==', currentInstanceId), // Filtra por instância
                window.firebaseOrderBy('timestamp', 'desc')
            );

            const querySnapshot = await window.firebaseGetDocs(q);
            actionLog = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                actionLog.push({
                    itemId: data.itemId,
                    itemName: data.itemName,
                    user: data.user,
                    actionType: data.actionType || 'kill',
                    time: data.timestamp ? data.timestamp.toMillis() : Date.now(),
                    instanceId: data.instanceId // Garante que a instância esteja no log
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
            const actionsCol = window.firebaseCollection(window.db, 'actions'); // Usando nova coleção 'actions'
            await window.firebaseAddDoc(actionsCol, {
                itemName: actionData.itemName,
                user: actionData.user,
                itemId: actionData.itemId,
                itemType: actionData.itemType,
                actionType: actionData.actionType,
                instanceId: currentInstanceId, // Adiciona a instância ao registro
                timestamp: new Date()
            });
            console.log(`Ação (${actionData.actionType}) registrada no Firestore para a instância ${currentInstanceId} com sucesso!`);
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

            const itemState = itemStates[item.id];
            const now = Date.now();
            let statusText = '';
            let nextSpawnDisplay = '';
            let lastActionDisplay = '';
            let buttonHtml = '';

            if (item.type === 'red') {
                let currentNextSpawnTime = itemStates[item.id].nextSpawnTime;
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
        if (actionLog.length === 0) {
            actionLogList.innerHTML = '<li>Nenhum registro de ação ainda.</li>';
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
            saveData();
        }
    }

    // --- Manipuladores de Eventos ---
    reserveEntryBtn.addEventListener('click', () => {
        const nickname = nicknameInput.value.trim();
        if (nickname) {
            userReservation.nickname = nickname;
            userReservation.reservationUntil = Date.now() + (30 * 60 * 1000);
            saveData();
            updateReservationStatus();
        } else {
            alert('Por favor, digite seu nickname para reservar.');
        }
    });

    // --- Loop de Atualização ---
    function updateUI() {
        renderItemLists();
        updateReservationStatus();
    }

    // --- Inicialização ---
    loadData();
    updateUI();
    setInterval(updateUI, 1000);

    // Ajustado para 1 minuto para melhor resposta em multi-instância
    setInterval(fetchActionLogFromFirestore, 60000); // Busca o histórico atualizado do Firebase a cada 1 minuto
});
