// ==UserScript==
// @name         Дозорный помощник Ветра
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Автоматизация отписей дозоров для племени Ветра
// @author       сгусточка и дипсик
// @match        *://catwar.su/blog14288*
// @match        *://catwar.net/blog14288*
// @match        *://catwar.net/blog1172570*
// @match        *://catwar.su/blog1172570*
// @icon         https://catwar.net/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @updateURL    https://github.com/sgustochka/dozor-helper/raw/refs/heads/main/dozor-helper.user.js
// @downloadURL  https://github.com/sgustochka/dozor-helper/raw/refs/heads/main/dozor-helper.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Цветовая схема
    const COLORS = {
        bgMain: '#6f73ae',
        bgTabInactive: '#2E3565',
        bgTabActive: '#8D90C9',
        textDark: '#000000',
        border: '#2E3565',
        warning: '#8B0000',
        success: '#000000'
    };

    const FONT_FAMILY = 'Georgia, serif';

    const SECTORS = ['1', '2', '3', '4'];
    const LOCATIONS = [
        'Звёздная опушка',
        'Великое озеро',
        'Луг',
        'Граница между Ветром и Грозой',
        'Чаща леса',
        'Шумный поток',
        'Раскидистая вишня',
        'Каменистый берег'
    ];

    const PATROL_TIMES = ['12', '14', '16', '17', '18:30', '21'];

    let userData = {
        name: GM_getValue('user_name', ''),
        id: GM_getValue('user_id', ''),
        gender: GM_getValue('user_gender', 'male')
    };

    function saveUserData() {
    GM_setValue('user_name', userData.name);
    GM_setValue('user_id', userData.id);
    GM_setValue('user_gender', userData.gender);
    GM_setValue('user_isTemp', userData.isTemp);
    }

    function getVerbForm(verbType) {
        if (userData.gender === 'male') {
            const verbs = {
                'went': 'ушел',
                'started': 'начал',
                'left': 'ушёл'
            };
            return verbs[verbType] || '';
        } else if (userData.gender === 'female') {
            const verbs = {
                'went': 'ушла',
                'started': 'начала',
                'left': 'ушла'
            };
            return verbs[verbType] || '';
        } else {
            const verbs = {
                'went': 'ушло',
                'started': 'начало',
                'left': 'ушло'
            };
            return verbs[verbType] || '';
        }
    }

    function getCurrentDate() {
        const d = new Date();
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}.${month}`;
    }

    function getCurrentTime() {
        const d = new Date();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    async function convertNameToId(name) {
        if (!name || !name.trim()) return '';
        if (name.match(/^\d+$/)) return name;

        const formattedName = name.split(' ').map(word => {
            if (word.length === 0) return word;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');

        const response = await fetch('/ajax/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                data: formattedName,
                delimiter: ',',
                template: '[link%id%]',
                type_in: '0',
                type_out: '0'
            })
        });
        const result = await response.text();
        const match = result.match(/\[link(\d+)\]/);
        return match ? match[1] : '';
    }

    async function getNameAndId(inputField, savedName, savedId, isTemp) {
    let name = inputField.value.trim();
    let id = '';

    // Если поле ввода пустое, берём сохранённые данные
    if (!name && (savedName || savedId)) {
        name = savedName;
        id = savedId;
        return { name: name, id: id, hasData: true };
    }

    // Если поле ввода заполнено
    if (name) {
        // ВРЕМЕННОЕ ИМЯ — используем сохранённые данные, не лезем в API
        if (isTemp && savedId) {
            // Берём ID из сохранённых данных
            id = savedId;
            return { name: name, id: id, hasData: true };
        }

        // ПОСТОЯННОЕ ИМЯ — проверяем через API
        if (name.match(/^\d+$/)) {
            id = name;
            const response = await fetch('/ajax/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    data: name,
                    delimiter: ',',
                    template: '%name%',
                    type_in: '1',
                    type_out: '0'
                })
            });
            const resultName = await response.text();
            name = resultName.trim() || name;
        } else {
            const convertedId = await convertNameToId(name);
            id = convertedId || '';
        }

        return { name: name, id: id, hasData: true };
    }

    return { name: '', id: '', hasData: false };
}

    function validateDuration(startTime, endTime, hasPatrol) {
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        let startTotal = startHour * 60 + startMin;
        let endTotal = endHour * 60 + endMin;

        if (endTotal < startTotal) {
            endTotal += 24 * 60;
        }

        const duration = endTotal - startTotal;
        const minRequired = hasPatrol ? 45 : 30;

        if (duration < minRequired) {
            return {
                valid: false,
                message: `Дозор длится ${duration} минут. Минимальная длительность: ${minRequired} минут.`
            };
        }

        return { valid: true, duration: duration };
    }
        function createUserPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = 'background-color: ' + COLORS.bgMain + '; border: 1px solid ' + COLORS.border + '; margin: 10px 0; padding: 10px; font-family: ' + FONT_FAMILY + '; color: ' + COLORS.textDark + ';';

    panel.innerHTML = `
        <div style="background-color: ${COLORS.bgTabActive}; padding: 6px 10px; margin: -10px -10px 10px -10px; font-size: 14px; font-weight: bold; text-align: center; color: ${COLORS.textDark};">Мои данные</div>
        <div style="display: grid; grid-template-columns: 100px 1fr; gap: 8px; align-items: center; font-size: 13px;">
            <span>Имя:</span>
            <input type="text" id="user_name_input" placeholder="Ваше имя" value="${userData.name}" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">
            <span>ID:</span>
            <input type="text" id="user_id_input" placeholder="Ваш ID" value="${userData.id}" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">
            <span>Пол:</span>
            <select id="user_gender_input" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">
                <option value="male" ${userData.gender === 'male' ? 'selected' : ''}>Мужской</option>
                <option value="female" ${userData.gender === 'female' ? 'selected' : ''}>Женский</option>
                <option value="neutral" ${userData.gender === 'neutral' ? 'selected' : ''}>Нейтральный</option>
            </select>
            <span>Временное имя:</span>
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="user_temp_checkbox" ${userData.isTemp ? 'checked' : ''} style="width: auto;">
                <label for="user_temp_checkbox" style="font-size: 11px;">(если ваше имя на текущий момент сменено)</label>
            </div>
        </div>
        <div id="save_status" style="font-size: 11px; margin-top: 5px; text-align: center; color: ${COLORS.success}; display: none;"></div>
        <button id="save_user_btn" style="width: 100%; margin-top: 10px; padding: 5px; background: ${COLORS.bgTabActive}; color: ${COLORS.textDark}; border: none; cursor: pointer; font-family: ${FONT_FAMILY}; font-weight: bold;">Сохранить</button>
    `;

    const saveBtn = panel.querySelector('#save_user_btn');
    const nameInput = panel.querySelector('#user_name_input');
    const idInput = panel.querySelector('#user_id_input');
    const genderSelect = panel.querySelector('#user_gender_input');
    const tempCheckbox = panel.querySelector('#user_temp_checkbox');
    const statusDiv = panel.querySelector('#save_status');

    saveBtn.onclick = async () => {
        let name = nameInput.value.trim();
        let id = idInput.value.trim();
        const isTemp = tempCheckbox.checked;

        // Скрываем предыдущее сообщение
        statusDiv.style.display = 'none';

        // Если оба поля пустые
        if (!name && !id) {
            statusDiv.textContent = 'Заполните хотя бы одно поле (имя или ID)';
            statusDiv.style.color = COLORS.warning;
            statusDiv.style.display = 'block';
            return;
        }

        // === ВРЕМЕННОЕ ИМЯ ===
        if (isTemp) {
            // Если есть имя, но нет ID
            if (name && !id) {
                statusDiv.textContent = 'Постоянное имя сохранено. Не забудьте привязать к нему ID. Пожалуйста, убедитесь, что в имени имени нет опечаток.';
                statusDiv.style.color = COLORS.warning;
                statusDiv.style.display = 'block';

                userData.name = name;
                userData.id = '';
                userData.gender = genderSelect.value;
                userData.isTemp = true;
                saveUserData();

                saveBtn.textContent = 'Сохранено!';
                setTimeout(() => { saveBtn.textContent = 'Сохранить'; }, 1500);
                return;
            }

            // Если есть и имя, и ID
            if (name && id) {
                statusDiv.textContent = 'Постоянное имя сохранено. Убедитесь, что ID соответствует имени, а в имени нет опечаток.';
                statusDiv.style.color = COLORS.warning;
                statusDiv.style.display = 'block';

                userData.name = name;
                userData.id = id;
                userData.gender = genderSelect.value;
                userData.isTemp = true;
                saveUserData();

                saveBtn.textContent = 'Сохранено!';
                setTimeout(() => { saveBtn.textContent = 'Сохранить'; }, 1500);
                return;
            }

            // Только ID (без имени)
            if (id && !name) {
                statusDiv.textContent = 'Укажите своё постоянное имя (не только ID)';
                statusDiv.style.color = COLORS.warning;
                statusDiv.style.display = 'block';
                return;
            }
        }

        // === ПОСТОЯННОЕ ИМЯ (обычная проверка) ===

        // Случай 1: заполнили только имя
        if (name && !id) {
            statusDiv.textContent = 'Ищу ID по имени...';
            statusDiv.style.display = 'block';

            const convertedId = await convertNameToId(name);
            if (convertedId) {
                id = convertedId;
                idInput.value = id;
                statusDiv.textContent = 'ID найден и добавлен!';
                statusDiv.style.color = COLORS.success;
            } else {
                statusDiv.textContent = 'Не удалось найти ID по этому имени. Проверьте имя.';
                statusDiv.style.color = COLORS.warning;
                return;
            }
        }

        // Случай 2: заполнили только ID
        if (id && !name) {
            statusDiv.textContent = 'Ищу имя по ID...';
            statusDiv.style.display = 'block';

            const response = await fetch('/ajax/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    data: id,
                    delimiter: ',',
                    template: '%name%',
                    type_in: '1',
                    type_out: '0'
                })
            });
            const resultName = await response.text();
            if (resultName && resultName.trim() && !resultName.includes('link')) {
                name = resultName.trim();
                nameInput.value = name;
                statusDiv.textContent = 'Имя найдено и добавлено!';
                statusDiv.style.color = COLORS.success;
            } else {
                statusDiv.textContent = 'Не удалось найти имя по этому ID. Проверьте ID.';
                statusDiv.style.color = COLORS.warning;
                return;
            }
        }

        // Случай 3: заполнили оба поля — проверяем соответствие
        if (name && id) {
            statusDiv.textContent = 'Проверяю соответствие имени и ID...';
            statusDiv.style.display = 'block';

            const checkId = await convertNameToId(name);

            // Если имя не найдено в системе
            if (!checkId) {
                statusDiv.textContent = `Имя "${name}" не найдено в системе. Проверьте правильность написания.`;
                statusDiv.style.color = COLORS.warning;
                statusDiv.style.display = 'block';
                return;
            }

            // Если имя найдено, но ID не совпадает
            if (checkId && checkId !== id) {
                statusDiv.textContent = `Имя "${name}" соответствует ID ${checkId}, а вы ввели ${id}. ID исправлен на ${checkId}.`;
                statusDiv.style.color = COLORS.warning;
                id = checkId;
                idInput.value = id;
                setTimeout(() => {
                    statusDiv.style.display = 'none';
                }, 3000);
            } else {
                statusDiv.textContent = 'Имя и ID соответствуют друг другу!';
                statusDiv.style.color = COLORS.success;
                setTimeout(() => {
                    statusDiv.style.display = 'none';
                }, 1500);
            }
        }

        // Сохраняем постоянные данные
        userData.name = name;
        userData.id = id;
        userData.gender = genderSelect.value;
        userData.isTemp = false;
        saveUserData();

        // Обновляем статус
        if (!statusDiv.textContent.includes('⚠️') && !statusDiv.textContent.includes('❌')) {
            statusDiv.style.color = COLORS.success;
            statusDiv.style.display = 'block';
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 1500);
        }

        saveBtn.textContent = 'Сохранено!';
        setTimeout(() => { saveBtn.textContent = 'Сохранить'; }, 1500);
    };

    return panel;
}

    function createDozorForm() {
        const div = document.createElement('div');
        div.style.marginBottom = '15px';
        div.style.padding = '10px';
        div.style.backgroundColor = COLORS.bgMain;
        div.style.border = '1px solid ' + COLORS.border;
        div.style.fontFamily = FONT_FAMILY;

        const currentDate = getCurrentDate();
        const currentTime = getCurrentTime();

        div.innerHTML = `
            <div style="background-color: ${COLORS.bgTabActive}; padding: 4px; margin-bottom: 10px; font-weight: bold; text-align: center; color: ${COLORS.textDark};">Отчёт дозора</div>
            <div style="display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: center; font-size: 13px;">
                <span>Ваше имя/ID:</span>
                <input type="text" id="dozor_name" placeholder="Имя или ID" value="" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">

                <span>Начало (дата):</span>
                <input type="text" id="dozor_start_date" placeholder="дд.мм" value="${currentDate}" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">

                <span>Начало (время):</span>
                <input type="time" id="dozor_start_time" value="${currentTime}" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};" step="60">

                <span>Окончание (дата):</span>
                <input type="text" id="dozor_end_date" placeholder="дд.мм" value="${currentDate}" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">

                <span>Окончание (время):</span>
                <input type="time" id="dozor_end_time" value="${currentTime}" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};" step="60">

                <span>Место дозора:</span>
                <select id="dozor_location_type" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">
                    <option value="sector">Сектор</option>
                    <option value="location">Локация</option>
                </select>

                <span>Сектор/локация:</span>
                <select id="dozor_sector" style="width: 100%; padding: 4px; display: none; font-family: ${FONT_FAMILY};">
                    ${SECTORS.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
                <select id="dozor_location" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">
                    ${LOCATIONS.map(l => `<option value="${l}">${l}</option>`).join('')}
                </select>

                <span>Отход в патруль:</span>
                <select id="dozor_patrol" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">
                    <option value="no">—</option>
                    <option value="yes">+</option>
                </select>
            </div>
            <div id="dozor_warning" style="color: ${COLORS.warning}; font-size: 12px; margin-top: 8px; text-align: center; display: none;"></div>
            <button id="dozor_submit" style="width:100%; margin-top:10px; padding:6px; background:${COLORS.bgTabActive}; color:${COLORS.textDark}; border:none; cursor:pointer; font-family:${FONT_FAMILY}; font-weight:bold;">Сформировать отчёт</button>
        `;

        const locationType = div.querySelector('#dozor_location_type');
        const sectorSelect = div.querySelector('#dozor_sector');
        const locationSelect = div.querySelector('#dozor_location');
        const warningDiv = div.querySelector('#dozor_warning');
        const nameInput = div.querySelector('#dozor_name');

        if (userData.name && !nameInput.value) {
            nameInput.value = userData.name;
        }

        locationType.addEventListener('change', () => {
            if (locationType.value === 'sector') {
                sectorSelect.style.display = 'block';
                locationSelect.style.display = 'none';
            } else {
                sectorSelect.style.display = 'none';
                locationSelect.style.display = 'block';
            }
        });
        locationType.dispatchEvent(new Event('change'));

        div.querySelector('#dozor_submit').onclick = async () => {
            const userInfo = await getNameAndId(nameInput, userData.name, userData.id, userData.isTemp);

            if (!userInfo.hasData) {
                warningDiv.textContent = 'Введите ваше имя или ID в поле выше, либо сохраните данные в разделе "Мои данные"';
                warningDiv.style.display = 'block';
                return;
            }

            const startDate = div.querySelector('#dozor_start_date').value;
            const startTime = div.querySelector('#dozor_start_time').value;
            const endDate = div.querySelector('#dozor_end_date').value;
            const endTime = div.querySelector('#dozor_end_time').value;
            const hasPatrol = div.querySelector('#dozor_patrol').value === 'yes';
            const locationValue = locationType.value === 'sector'
                ? sectorSelect.value
                : locationSelect.value;

            const validation = validateDuration(startTime, endTime, hasPatrol);
            if (!validation.valid) {
                warningDiv.textContent = validation.message;
                warningDiv.style.display = 'block';
                return;
            }
            warningDiv.style.display = 'none';

            const patrolSymbol = hasPatrol ? '+' : '—';
            const report = `[b]${userInfo.name} [${userInfo.id}][/b]
[b]Начало дозора:[/b] ${startDate}, ${startTime}
[b]Окончание дозора:[/b] ${endDate}, ${endTime}
[b]Место дозора:[/b] ${locationValue}
[b]Отход в патруль:[/b] ${patrolSymbol}`;

            const field = document.querySelector('#comment');
            if (field) {
                field.value = report;
                field.focus();
            }
        };

        return div;
    }

    function createStartForm() {
        const div = document.createElement('div');
        div.style.marginBottom = '15px';
        div.style.padding = '10px';
        div.style.backgroundColor = COLORS.bgMain;
        div.style.border = '1px solid ' + COLORS.border;
        div.style.fontFamily = FONT_FAMILY;

        div.innerHTML = `
            <div style="background-color: ${COLORS.bgTabActive}; padding: 4px; margin-bottom: 10px; font-weight: bold; text-align: center; color: ${COLORS.textDark};">Выход в дозор</div>
            <div style="display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: center; font-size: 13px;">
                <span>Ваше имя/ID:</span>
                <input type="text" id="start_name" placeholder="Имя или ID" value="" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">

                <span>Вид дозора:</span>
                <select id="start_type" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">
                    <option value="active">Активный</option>
                    <option value="passive">Пассивный</option>
                </select>

                <span>Место дозора:</span>
                <select id="start_sector" style="width: 100%; padding: 4px; display: none; font-family: ${FONT_FAMILY};">
                    ${SECTORS.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
                <select id="start_location" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">
                    ${LOCATIONS.map(l => `<option value="${l}">${l}</option>`).join('')}
                </select>
            </div>
            <div id="start_warning" style="color: ${COLORS.warning}; font-size: 12px; margin-top: 8px; text-align: center; display: none;"></div>
            <button id="start_submit" style="width:100%; margin-top:10px; padding:6px; background:${COLORS.bgTabActive}; color:${COLORS.textDark}; border:none; cursor:pointer; font-family:${FONT_FAMILY}; font-weight:bold;">Сформировать</button>
        `;

        const typeSelect = div.querySelector('#start_type');
        const sectorSelect = div.querySelector('#start_sector');
        const locationSelect = div.querySelector('#start_location');
        const warningDiv = div.querySelector('#start_warning');
        const nameInput = div.querySelector('#start_name');

        if (userData.name && !nameInput.value) {
            nameInput.value = userData.name;
        }

        typeSelect.addEventListener('change', () => {
            if (typeSelect.value === 'active') {
                sectorSelect.style.display = 'block';
                locationSelect.style.display = 'none';
            } else {
                sectorSelect.style.display = 'none';
                locationSelect.style.display = 'block';
            }
        });
        typeSelect.dispatchEvent(new Event('change'));

        div.querySelector('#start_submit').onclick = async () => {
            const userInfo = await getNameAndId(nameInput, userData.name, userData.id, userData.isTemp);

            if (!userInfo.hasData) {
                warningDiv.textContent = 'Введите ваше имя или ID в поле выше, либо сохраните данные в разделе "Мои данные"';
                warningDiv.style.display = 'block';
                return;
            }
            warningDiv.style.display = 'none';

            const type = typeSelect.value;
            const value = type === 'active' ? sectorSelect.value : locationSelect.value;
            const startedVerb = getVerbForm('started');

            const report = `Я, ${userInfo.name} [${userInfo.id}], ${startedVerb} ${type === 'active' ? 'активный' : 'пассивный'} дозор. ${type === 'active' ? 'Сектор' : 'Локация'}: ${value}.`;

            const field = document.querySelector('#comment');
            if (field) {
                field.value = report;
                field.focus();
            }
        };

        return div;
    }

    function createPatrolForm() {
        const div = document.createElement('div');
        div.style.marginBottom = '15px';
        div.style.padding = '10px';
        div.style.backgroundColor = COLORS.bgMain;
        div.style.border = '1px solid ' + COLORS.border;
        div.style.fontFamily = FONT_FAMILY;

        div.innerHTML = `
            <div style="background-color: ${COLORS.bgTabActive}; padding: 4px; margin-bottom: 10px; font-weight: bold; text-align: center; color: ${COLORS.textDark};">Отход в патруль</div>
            <div style="display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: center; font-size: 13px;">
                <span>Ваше имя/ID:</span>
                <input type="text" id="patrol_name" placeholder="Имя или ID" value="" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">

                <span>Время отхода:</span>
                <select id="patrol_time" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">
                    ${PATROL_TIMES.map(t => `<option value="${t}">${t}</option>`).join('')}
                </select>
            </div>
            <div id="patrol_warning" style="color: ${COLORS.warning}; font-size: 12px; margin-top: 8px; text-align: center; display: none;"></div>
            <button id="patrol_submit" style="width:100%; margin-top:10px; padding:6px; background:${COLORS.bgTabActive}; color:${COLORS.textDark}; border:none; cursor:pointer; font-family:${FONT_FAMILY}; font-weight:bold;">Сформировать</button>
        `;

        const warningDiv = div.querySelector('#patrol_warning');
        const nameInput = div.querySelector('#patrol_name');

        if (userData.name && !nameInput.value) {
            nameInput.value = userData.name;
        }

        div.querySelector('#patrol_submit').onclick = async () => {
            const userInfo = await getNameAndId(nameInput, userData.name, userData.id, userData.isTemp);

            if (!userInfo.hasData) {
                warningDiv.textContent = 'Введите ваше имя или ID в поле выше, либо сохраните данные в разделе "Мои данные"';
                warningDiv.style.display = 'block';
                return;
            }
            warningDiv.style.display = 'none';

            const time = div.querySelector('#patrol_time').value;
            const wentVerb = getVerbForm('went');

            const report = `Я, ${userInfo.name} [${userInfo.id}], ${wentVerb} в патруль на ${time}.`;

            const field = document.querySelector('#comment');
            if (field) {
                field.value = report;
                field.focus();
            }
        };

        return div;
    }

    function createViolatorForm() {
        const div = document.createElement('div');
        div.style.marginBottom = '15px';
        div.style.padding = '10px';
        div.style.backgroundColor = COLORS.bgMain;
        div.style.border = '1px solid ' + COLORS.border;
        div.style.fontFamily = FONT_FAMILY;

        div.innerHTML = `
            <div style="background-color: ${COLORS.bgTabActive}; padding: 4px; margin-bottom: 10px; font-weight: bold; text-align: center; color: ${COLORS.textDark};">Относ нарушителя</div>
            <div style="display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: center; font-size: 13px;">
                <span>Ваше имя/ID:</span>
                <input type="text" id="violator_name" placeholder="Имя или ID" value="" style="width: 100%; padding: 4px; font-family: ${FONT_FAMILY};">
            </div>
            <div id="violator_warning" style="color: ${COLORS.warning}; font-size: 12px; margin-top: 8px; text-align: center; display: none;"></div>
            <button id="violator_submit" style="width:100%; margin-top:10px; padding:6px; background:${COLORS.bgTabActive}; color:${COLORS.textDark}; border:none; cursor:pointer; font-family:${FONT_FAMILY}; font-weight:bold;">Сформировать</button>
        `;

        const warningDiv = div.querySelector('#violator_warning');
        const nameInput = div.querySelector('#violator_name');

        if (userData.name && !nameInput.value) {
            nameInput.value = userData.name;
        }

        div.querySelector('#violator_submit').onclick = async () => {
            const userInfo = await getNameAndId(nameInput, userData.name, userData.id, userData.isTemp);

            if (!userInfo.hasData) {
                warningDiv.textContent = 'Введите ваше имя или ID в поле выше, либо сохраните данные в разделе "Мои данные"';
                warningDiv.style.display = 'block';
                return;
            }
            warningDiv.style.display = 'none';

            const report = `Я, ${userInfo.name} [${userInfo.id}], отношу нарушителя.`;

            const field = document.querySelector('#comment');
            if (field) {
                field.value = report;
                field.focus();
            }
        };

        return div;
    }

    function addBackgroundStyle() {
        const style = document.createElement('style');
        style.textContent = `
            #dozor-helper-panel {
                background-image: url('https://allwebs.ru/images/2025/12/08/78e4729ccad4bf0bc4ee690bb1c22f0f.png');
                background-repeat: repeat;
                background-position: top left;
            }
        `;
        document.head.appendChild(style);
    }

    function createMainPanel() {
        const panel = document.createElement('div');
        panel.id = 'dozor-helper-panel';
        panel.style.cssText = 'border: 1px solid ' + COLORS.border + '; margin: 20px 0 10px 0; padding: 10px; font-family: ' + FONT_FAMILY + '; color: ' + COLORS.textDark + ';';

        panel.innerHTML = `
            <div class="panel-header" style="background-color: ${COLORS.bgTabActive}; padding: 8px 12px; margin: -10px -10px 10px -10px; font-size: 18px; font-weight: bold; text-align: center; color: ${COLORS.textDark};">Дозорный помощник</div>
            <div class="tab-bar" style="display: flex; border-bottom: 1px solid ${COLORS.border}; margin-bottom: 10px;">
                <div class="tab-btn active" data-tab="dozor" style="padding: 6px 12px; background: ${COLORS.bgTabActive}; color: ${COLORS.textDark}; cursor: pointer; margin-right: 4px;">Отчёт дозора</div>
                <div class="tab-btn" data-tab="start" style="padding: 6px 12px; background: ${COLORS.bgTabInactive}; color: #8D90C9; cursor: pointer; margin-right: 4px;">Выход в дозор</div>
                <div class="tab-btn" data-tab="patrol" style="padding: 6px 12px; background: ${COLORS.bgTabInactive}; color: #8D90C9; cursor: pointer; margin-right: 4px;">Отход в патруль</div>
                <div class="tab-btn" data-tab="violator" style="padding: 6px 12px; background: ${COLORS.bgTabInactive}; color: #8D90C9; cursor: pointer;">Относ нарушителя</div>
            </div>
            <div class="tab-content"></div>
        `;

        const content = panel.querySelector('.tab-content');
        const dozorTab = createDozorForm();
        const startTab = createStartForm();
        const patrolTab = createPatrolForm();
        const violatorTab = createViolatorForm();
        const userPanel = createUserPanel();

        content.appendChild(userPanel);
        content.appendChild(dozorTab);
        content.appendChild(startTab);
        content.appendChild(patrolTab);
        content.appendChild(violatorTab);

        startTab.style.display = 'none';
        patrolTab.style.display = 'none';
        violatorTab.style.display = 'none';

        const tabs = panel.querySelectorAll('.tab-btn');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => {
                    t.style.background = COLORS.bgTabInactive;
                    t.style.color = '#8D90C9';
                });
                tab.style.background = COLORS.bgTabActive;
                tab.style.color = COLORS.textDark;

                dozorTab.style.display = 'none';
                startTab.style.display = 'none';
                patrolTab.style.display = 'none';
                violatorTab.style.display = 'none';

                const tabId = tab.dataset.tab;
                if (tabId === 'dozor') dozorTab.style.display = 'block';
                if (tabId === 'start') startTab.style.display = 'block';
                if (tabId === 'patrol') patrolTab.style.display = 'block';
                if (tabId === 'violator') violatorTab.style.display = 'block';
            };
        });

        return panel;
    }

    function waitForElement(selector, callback) {
        const el = document.querySelector(selector);
        if (el) { callback(el); return; }
        const observer = new MutationObserver(() => {
            const found = document.querySelector(selector);
            if (found) { callback(found); observer.disconnect(); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    addBackgroundStyle();

    waitForElement('#send_comment', (commentBlock) => {
        const panel = createMainPanel();
        if (panel) {
            commentBlock.parentNode.insertBefore(panel, commentBlock.nextSibling);
        }
    });

})();
