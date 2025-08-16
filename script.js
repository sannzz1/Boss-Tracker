document.addEventListener('DOMContentLoaded', () => {
    // Referências aos elementos HTML
    const redBossListContainer = document.getElementById('redBossListContainer');
    const yellowBossListContainer = document.getElementById('yellowBossListContainer');
    const cyanBossListContainer = document.getElementById('cyanBossListContainer');
    const killLogList = document.getElementById('killLog');
    const nicknameInput = document.getElementById('nicknameInput');
    const reserveEntryBtn = document.getElementById('reserveEntryBtn');
    const reservationStatus = document.getElementById('reservationStatus');
    const resetAllDataBtn = document.getElementById('resetAllData');

    // --- Função: Calcula o próximo horário de spawn fixo para bosses vermelhos ---
    // (Lógica inalterada, pois é local e funciona bem)
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

    // --- Dados dos Bosses ---
    // (Inalterados, definidos diretamente no script)
    const bosses = {
        red: [
            { id: 'red-boss-1', name: 'Demonio do Fogo (Norte)', type: 'red', dailySpawnTimes: ['04:00', '10:00', '16:00', '22:00'], icon: '👹' },
            { id: 'red-boss-2', name: 'Rei Carmesim (Sul)', type: 'red', dailySpawnTimes: ['01:00', '07:00', '13:00', '19:00'], icon: '🔱' },
        ],
        yellow: [
            { id: 'yellow-boss-1', name: 'Guardião Dourado', type: 'yellow', respawnTime: 60 * 60 * 1000, icon: '👺' },
            { id: 'yellow-boss-2', name: 'Lobo Alfa', type: 'yellow', respawnTime: 60 * 60 * 1000, icon: '🦁' },
        ],
        cyan: [
            { id: 'cyan-boss-1', name: 'Espírito Ciano (Baixo-direita)', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '🔵' },
            { id: 'cyan-boss-2', name: 'Guardião Ciano (Meio-esquerda)', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '��' },
            { id: 'cyan-boss-3', name: 'Protetor Ciano (Meio-superior)', type: 'cyan', respawnTime: 30 * 60 * 1000, icon: '🔵' }
        ]
    };

    let bossStates = {}; // Estado atual dos timers dos bosses (local)
    let userReservation = { nickname: '', reservationUntil: null }; // Reserva do usuário (local)
    let killLog = []; // Histórico de kills (local)

    // --- Funções de Utilitário ---
    function formatTime(ms) {
        if (ms < 0) ms = 0;
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // --- Persistência de Dados (usando localStorage) ---
    // Agora salva TUDO no localStorage do navegador do usuário
    function saveData() {
        localStorage.setItem('bossTracker_bossStates', JSON.stringify(bossStates));
        localStorage.setItem('bossTracker_userReservation', JSON.stringify(userReservation));
        localStorage.setItem('bossTracker_killLog', JSON.stringify(killLog));
        localStorage.setItem('bossTracker_lastNickname', nicknameInput.value);
    }

    // Carrega TUDO do localStorage do navegador do usuário
    function loadData() {
        const savedBossStates = localStorage.getItem('bossTracker_bossStates');
        const savedUserReservation = localStorage.getItem('bossTracker_userReservation');
        const savedKillLog = localStorage.getItem('bossTracker_killLog'); // Carrega o histórico
        const lastNickname = localStorage.getItem('bossTracker_lastNickname');

        const allBosses = [...bosses.red, ...bosses.yellow, ...bosses.cyan];

        if (savedBossStates) {
            bossStates = JSON.parse(savedBossStates);
            // Garante que novos bosses ou bosses com IDs alterados sejam inicializados
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
                } else if (boss.type === 'red') { // Para bosses vermelhos, recalcula o próximo spawn se o salvo for passado
                    const currentNextSpawnTime = bossStates[boss.id].nextSpawnTime;
                    const now = Date.now();
                    if (currentNextSpawnTime <= now) {
                        bossStates[boss.id].nextSpawnTime = calculateNextSpecificSpawnTime(boss.dailySpawnTimes);
                    }
                }
            });
            // Remove bosses que não existem mais na lista atual (limpeza)
            for (const id in bossStates) {
                if (!allBosses.some(boss => boss.id === id)) {
                    delete bossStates[id];
                }
            }
        } else {
            // Inicializa todos os bosses se não houver dados salvos
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

        // Carrega a reserva do usuário
        if (savedUserReservation) {
            userReservation = JSON.parse(savedUserReservation);
        }
        // Carrega o histórico de kills
        if (savedKillLog) {
            killLog = JSON.parse(savedKillLog);
        }
        // Carrega o último nickname usado
        if (lastNickname) {
            nicknameInput.value = lastNickname;
        }
        saveData(); // Salva os dados atualizados/limpos para garantir consistência
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

    function handleBossKill(bossId) {
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
        }

        // Adiciona a kill ao histórico local
        killLog.push({
            bossId: boss.id,
            bossName: boss.name,
            user: nickname,
            time: now
        });
        saveData(); // Salva todas as alterações no localStorage
        updateUI(); // Atualiza a interface
    }

    resetAllDataBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja apagar TODOS os seus dados locais (timers, reservas e histórico)? Esta ação é irreversível e afetará apenas este navegador.')) {
            localStorage.clear();
            // Recarrega a página para reinicializar o estado
            location.reload();
        }
    });

    // --- Loop de Atualização ---
    function updateUI() {
        renderBossLists();
        renderKillLog(); // Atualiza o log local
        updateReservationStatus();
    }

    // --- Inicialização ---
    loadData(); // Carrega os dados salvos localmente
    updateUI(); // Renderiza a interface pela primeira vez
    setInterval(updateUI, 1000); // Atualiza a UI a cada segundo para os contadores
});
