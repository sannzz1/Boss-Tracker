document.addEventListener('DOMContentLoaded', () => {
    // URL da sua aplicação web do Google Apps Script (COPIE AQUI!)
    const GAS_WEB_APP_URL = 'SEU_URL_DO_APP_WEB_AQUI'; 

    const redBossListContainer = document.getElementById('redBossListContainer');
    const yellowBossListContainer = document.getElementById('yellowBossListContainer');
    const cyanBossListContainer = document.getElementById('cyanBossListContainer');
    const killLogList = document.getElementById('killLog');
    const nicknameInput = document.getElementById('nicknameInput');
    const reserveEntryBtn = document.getElementById('reserveEntryBtn');
    const reservationStatus = document.getElementById('reservationStatus');
    const resetAllDataBtn = document.getElementById('resetAllData');

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

    // --- Dados dos Bosses - Agora agrupados por tipo ---
    const bosses = {
        red: [
            { id: 'red-boss-1', name: 'Demonio do Fogo (Norte)', type: 'red', dailySpawnTimes: ['04:00', '10:00', '16:00', '22:00'], icon: '👹' },
            { id: 'red-boss-2', name: 'Rei Carmesim (Sul)', type: 'red', dailySpawnTimes: ['01:00', '07:00', '13:00', '19:00'], icon: '🔱' },
        ],
        yellow: [
            { id: 'yellow-boss-1', name: 'Guardião Dourado', type: 'yellow', respawnTime: 60 * 60 * 1000, icon: '��' },
            { id: 'yellow-boss-2', name: 'Lobo Alfa', type: 'yellow', respawnTime: 60 * 60 * 1000, icon: '🦁' },
        ],
        cyan: [
            { id: 'cyan-boss-1', name: 'Espírito Ciano (Baixo-direita)', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '��' },
            { id: 'cyan-boss-2', name: 'Guardião Ciano (Meio-esquerda)', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '🔵' },
            { id: 'cyan-boss-3', name: 'Protetor Ciano (Meio-superior)', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '🔵' }
        ]
    };

    let bossStates = {};
    let userReservation = { nickname: '', reservationUntil: null };
    let killLog = []; // killLog será preenchido pelo Google Sheet

    // --- Funções de Utilitário ---
    function formatTime(ms) {
        if (ms < 0) ms = 0;
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // --- Persistência de Dados (localStorage para bossStates e reservation) ---
    function saveData() {
        localStorage.setItem('bossTracker_bossStates', JSON.stringify(bossStates));
        localStorage.setItem('bossTracker_userReservation', JSON.stringify(userReservation));
        localStorage.setItem('bossTracker_lastNickname', nicknameInput.value);
        // killLog não é mais salvo localmente, é gerido pelo Google Sheet
    }

    async function loadData() {
        const savedBossStates = localStorage.getItem('bossTracker_bossStates');
        const savedUserReservation = localStorage.getItem('bossTracker_userReservation');
        const lastNickname = localStorage.getItem('bossTracker_lastNickname');

        const allBosses = [...bosses.red, ...bosses.yellow, ...bosses.cyan];

        if (savedBossStates) {
            bossStates = JSON.parse(savedBossStates);
            allBosses.forEach(boss => {
                if (!bossStates[boss.id]) {
                    if (boss.type === 'red') {
                        bossStates[boss.id] = {
                            lastKillTime: null,
                            nextSpawnTime: calculateNextSpecificSpawnTime(boss.dailySpawnTimes)
                        };
                    } else {
                        bossStates[boss.id] = {
                            lastKillTime: null,
                            nextSpawnTime: Date.now()
                        };
                    }
                } else if (boss.type === 'red') {
                    const currentNextSpawnTime = bossStates[boss.id].nextSpawnTime;
                    const now = Date.now();
                    if (currentNextSpawnTime <= now) {
                        bossStates[boss.id].nextSpawnTime = calculateNextSpecificSpawnTime(boss.dailySpawnTimes);
                    }
                }
            });
            for (const id in bossStates) {
                if (!allBosses.some(boss => boss.id === id)) {
                    delete bossStates[id];
                }
            }
        } else {
            allBosses.forEach(boss => {
                if (boss.type === 'red') {
                    bossStates[boss.id] = {
                        lastKillTime: null,
                        nextSpawnTime: calculateNextSpecificSpawnTime(boss.dailySpawnTimes)
                    };
                } else {
                    bossStates[boss.id] = {
                        lastKillTime: null,
                        nextSpawnTime: Date.now()
                    };
                }
            });
        }

        if (savedUserReservation) {
            userReservation = JSON.parse(savedUserReservation);
        }
        if (lastNickname) {
            nicknameInput.value = lastNickname;
        }
        saveData(); // Salva estados atualizados/limpos no localStorage
        await fetchKillLogFromGoogleSheet(); // Carrega o histórico da planilha
    }

    // --- Comunicação com Google Apps Script ---
    async function fetchKillLogFromGoogleSheet() {
        try {
            const response = await fetch(GAS_WEB_APP_URL, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                //mode: 'no-cors' // Use se houver problemas de CORS, mas CORS é preferível
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            // Assumimos que o Apps Script retorna um array de objetos
            // e que o campo Timestamp é um timestamp Unix ou ISO string
            killLog = data.map(record => ({
                bossId: record.BossId,
                bossName: record.BossName,
                user: record.KilledBy,
                // Converte a string de data para um objeto Date
                time: new Date(record.Timestamp).getTime() 
            }));
            renderKillLog(); // Renderiza o log após carregar
        } catch (error) {
            console.error('Erro ao buscar histórico da planilha:', error);
            killLogList.innerHTML = '<li>Erro ao carregar histórico.</li>';
        }
    }

    async function sendKillToGoogleSheet(killData) {
        try {
            const response = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(killData),
                //mode: 'no-cors' // Use se houver problemas de CORS
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            if (result.success) {
                console.log('Kill registrada na planilha:', result.message);
                // Após o sucesso, força a atualização do log
                await fetchKillLogFromGoogleSheet(); 
            } else {
                console.error('Erro ao registrar kill na planilha:', result.message);
            }
        } catch (error) {
            console.error('Erro de rede ao enviar kill para planilha:', error);
        }
    }


    // --- Renderização da UI ---
    function renderBossLists() {
        redBossListContainer.innerHTML = '';
        yellowBossListContainer.innerHTML = '';
        cyanBossListContainer.innerHTML = '';

        const renderBossCard = (boss) => {
            const bossCard = document.createElement('div');
            bossCard.classList.add('boss-card', boss.type);
            bossCard.dataset.bossId = boss.id;

            const bossState = bossStates[boss.id];
            const now = Date.now();
            let statusText = '';
            let timeLeft = 0;

            if (boss.type === 'red') {
                let currentNextSpawnTime = bossStates[boss.id].nextSpawnTime;

                if (currentNextSpawnTime <= now) {
                    statusText = 'Ativo';
                    timeLeft = 0;

                    const newNextSpawnTime = calculateNextSpecificSpawnTime(boss.dailySpawnTimes);
                    if (newNextSpawnTime > now) {
                        bossStates[boss.id].nextSpawnTime = newNextSpawnTime;
                        saveData();
                    }
                } else {
                    timeLeft = currentNextSpawnTime - now;
                    statusText = formatTime(timeLeft);
                }
            } else { // Yellow or Cyan
                if (!bossState || !bossState.lastKillTime || bossState.nextSpawnTime <= now) {
                    statusText = 'Ativo';
                    timeLeft = 0;
                } else {
                    timeLeft = bossState.nextSpawnTime - now;
                    statusText = `Respawn em: ${formatTime(timeLeft)}`;
                }
            }

            bossCard.innerHTML = `
                <h3>${boss.name} ${boss.icon}</h3>
                <p>Tipo: <span style="color: ${boss.type === 'red' ? 'red' : boss.type === 'yellow' ? 'gold' : 'cyan'};">${boss.type.toUpperCase()}</span></p>
                <p class="status-text">${statusText}</p>
                ${boss.type !== 'red' ? `<button class="kill-button" data-boss-id="${boss.id}">Matar</button>` : ''}
            `;
            return bossCard;
        };

        bosses.red.forEach(boss => redBossListContainer.appendChild(renderBossCard(boss)));
        bosses.yellow.forEach(boss => yellowBossListContainer.appendChild(renderBossCard(boss)));
        bosses.cyan.forEach(boss => cyanBossListContainer.appendChild(renderBossCard(boss)));

        document.querySelectorAll('.kill-button').forEach(button => {
            button.onclick = (event) => {
                event.stopPropagation();
                handleBossKill(button.dataset.bossId);
            };
        });
    }

    function renderKillLog() {
        killLogList.innerHTML = '';
        if (killLog.length === 0) {
            killLogList.innerHTML = '<li>Nenhum registro de kill ainda.</li>';
            return;
        }
        // Ordena por tempo (mais recente primeiro)
        killLog.sort((a, b) => b.time - a.time).forEach(log => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${log.bossName}</strong> morto por <strong>${log.user || 'Desconhecido'}</strong> em ${new Date(log.time).toLocaleString()}`;
            killLogList.appendChild(li);
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

    async function handleBossKill(bossId) {
        let boss = null;
        for (const type in bosses) {
            boss = bosses[type].find(b => b.id === bossId);
            if (boss) break;
        }
        if (!boss) return;

        const now = Date.now();
        const nickname = nicknameInput.value.trim() || 'Anônimo';

        if (boss.type !== 'red') {
            bossStates[boss.id].lastKillTime = now;
            bossStates[boss.id].nextSpawnTime = now + boss.respawnTime;
            saveData(); // Salva o novo estado no localStorage
        }

        // Envia a informação da kill para o Google Sheet
        const killData = {
            bossName: boss.name,
            user: nickname,
            bossId: boss.id,
            bossType: boss.type
        };
        await sendKillToGoogleSheet(killData); // Agora é assíncrono

        // updateUI() será chamado após a confirmação da gravação na planilha.
        // O fetchKillLogFromGoogleSheet() dentro de sendKillToGoogleSheet() já chama renderKillLog().
        renderBossLists(); // Atualiza apenas os timers
        updateReservationStatus();
    }

    resetAllDataBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja apagar TODOS os dados (timers locais e reservas)? O histórico da planilha não será afetado.')) {
            localStorage.clear();
            // Recarrega para inicializar bossStates corretamente após o reset
            location.reload();
        }
    });

    // --- Loop de Atualização ---
    function updateUI() {
        renderBossLists();
        updateReservationStatus();
    }

    // --- Inicialização ---
    loadData();
    updateUI(); // Renderiza os elementos iniciais
    setInterval(updateUI, 1000); // Atualiza UI a cada segundo para os contadores

    // A cada 2 minutos (120000 ms), busca o log da planilha
    setInterval(fetchKillLogFromGoogleSheet, 120000); 
});