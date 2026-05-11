/**
 * BEAUTIFY Admin Management Logic
 */

const GAS_APP_URL = 'https://script.google.com/macros/s/AKfycbywQ3IRjhFWeOw6vbAK4b-TI_Whl2tRyzjHlB-xdYxHZqnHFcjKgu_PjJMv1t8fKQIv/exec';

// MOVE THIS TO THE TOP to ensure it's defined
window.switchAdminTab = function (tab) {
    console.log('Switching to tab:', tab);
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const targetTab = document.getElementById(`tab-${tab}`);
    if (targetTab) targetTab.classList.add('active');

    const views = ['view-bookings', 'view-designers', 'view-groups', 'view-promos'];
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.classList.add('hidden');
    });

    const targetView = document.getElementById(`view-${tab}`);
    if (targetView) targetView.classList.remove('hidden');
}

async function apiGet(action, params = {}) {
    const query = new URLSearchParams({ action, ...params }).toString();
    const response = await fetch(`${GAS_APP_URL}?${query}`);
    const text = await response.text();
    try {
        const result = JSON.parse(text);
        if (result.success) return result.data;
        throw new Error(result.error || 'Backend Error');
    } catch (e) {
        console.error('API Response Text (Non-JSON):', text);
        throw new Error(`解析失敗: ${e.message} \n(詳見 Console)`);
    }
}

async function apiPost(action, data) {
    const response = await fetch(`${GAS_APP_URL}?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data)
    });
    const text = await response.text();
    try {
        const result = JSON.parse(text);
        if (result.success) return result.data;
        throw new Error(result.error || 'Backend Error');
    } catch (e) {
        console.error('API Post Response Text:', text);
        throw new Error(`操作失敗: ${e.message}`);
    }
}

async function loadData() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.classList.remove('fade-out');
        loading.classList.remove('hidden');
    }

    try {
        const stats = await apiGet('getIncomeStats');
        const bookings = await apiGet('getAllBookings');
        const designers = await apiGet('getDesigners');
        const groups = await apiGet('getSlotGroups');
        const promoStats = await apiGet('getPromoCodeStats');

        renderStats(stats);
        renderBookings(bookings);
        renderDesignerAdmin(designers);
        renderGroupAdmin(groups);
        renderPromoAdmin(promoStats);

        if (loading) {
            loading.classList.add('fade-out');
            setTimeout(() => loading.classList.add('hidden'), 500);
        }
    } catch (err) {
        console.error('Loader Error:', err);
        if (loading) loading.classList.add('hidden');
        alert('載入數據失敗：' + err.message);
    }
}

function renderStats(stats) {
    document.getElementById('totalIncome').innerText = `NT$ ${stats.totalIncome || 0}`;
    document.getElementById('totalCount').innerText = stats.count || 0;

    let designerHtml = '';
    const perf = stats.designerPerformance || {};
    for (const [id, rev] of Object.entries(perf)) {
        designerHtml += `<div style="display: flex; justify-content: space-between;"><span>${id}</span><span>NT$ ${rev}</span></div>`;
    }
    document.getElementById('designer-stats').innerHTML = designerHtml || '尚無數據';
}

function renderBookings(bookings) {
    const container = document.getElementById('booking-list');
    if (!container) return;
    if (!bookings || bookings.length === 0) {
        container.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: grey;">尚無預約訂單</td></tr>';
        return;
    }

    container.innerHTML = [...bookings].sort((a, b) => new Date(b.DateTime) - new Date(a.DateTime)).map(b => `
    <tr>
      <td><small>${b.ID}</small></td>
      <td><b>${b.Name}</b><br><small style="color: grey;">${b.Phone || 'N/A'}</small></td>
      <td>${b.Phone || b.mobile || 'N/A'}</td>
      <td>${b.ServiceName1 || b.ServiceName}</td>
      <td>${b.DateTime}</td>
      <td>NT$ ${b.Amount}</td>
      <td>
        <select onchange="updateStatus('${b.ID}', this.value)" class="status-select">
          <option value="Pending" ${b.Status === 'Pending' ? 'selected' : ''}>⏳ 待處理</option>
          <option value="Confirmed" ${b.Status === 'Confirmed' ? 'selected' : ''}>✅ 已確認</option>
          <option value="Completed" ${b.Status === 'Completed' ? 'selected' : ''}>⭐ 已完成</option>
          <option value="Cancelled" ${b.Status === 'Cancelled' ? 'selected' : ''}>🚫 已取消</option>
        </select>
        <br><small style="color:var(--primary)">${b.PromoCode || ''}</small>
      </td>
    </tr>
  `).join('');
}

let designersCache = [];
let groupsCache = [];
let promosCache = [];

function renderDesignerAdmin(designers) {
    designersCache = designers;
    const container = document.getElementById('designer-list-admin');
    if (!container || !designers) return;

    // Update group dropdown in modal
    const groupSelect = document.getElementById('designerGroupId');
    if (groupSelect) {
        groupSelect.innerHTML = '<option value="">-- 手動模式 (使用下方時間設定) --</option>' +
            groupsCache.map(g => `<option value="${g.GroupID}">${g.Name}</option>`).join('');
    }

    container.innerHTML = designers.map(d => `
        <tr>
            <td><small>${d.ID}</small></td>
            <td><img src="${d.Photo}" style="width: 40px; height: 40px; border-radius: 50%; object-fit:cover;" onerror="this.src='https://via.placeholder.com/40'"></td>
            <td><strong>${d.Name}</strong></td>
            <td>${d.Specialty}</td>
            <td><small>${d.GroupID ? '群組: ' + (groupsCache.find(gx => gx.GroupID === d.GroupID)?.Name || d.GroupID) : (d.StartHour || '10') + ':00 - ' + (d.EndHour || '20') + ':00'}</small></td>
            <td><small>${d.OffDays || '--'}</small></td>
            <td><small>${d.SlotInterval || 30}m</small></td>
            <td>
                <select onchange="updateDesignerField('${d.ID}', 'status', this.value)">
                    <option value="Active" ${d.Status === 'Active' ? 'selected' : ''}>🟢 在職</option>
                    <option value="Inactive" ${d.Status === 'Inactive' ? 'selected' : ''}>🔴 離職</option>
                </select>
            </td>
            <td>
                <div style="display: flex; gap: 5px;">
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 12px; margin: 0; width: auto;" onclick="openEditModal('${d.ID}')">編輯</button>
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 12px; margin: 0; width: auto; background: #c0392b;" onclick="deleteDesigner('${d.ID}')">刪除</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderPromoAdmin(promos) {
    promosCache = promos;
    const container = document.getElementById('promo-list-admin');
    if (!container) return;

    container.innerHTML = promos.map(p => `
        <tr>
            <td><strong>${p.code || '--'}</strong></td>
            <td>${p.description || '--'}</td>
            <td>${p.referral || '--'}</td>
            <td style="text-align: center;"><span style="color: var(--primary); font-weight: bold; font-size: 18px;">${p.count || 0}</span></td>
            <td>${p.status || 'Active'}</td>
            <td>
                <div style="display: flex; gap: 5px;">
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 12px; margin: 0; width: auto;" onclick="openPromoModal('${p.code}')">編輯</button>
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 12px; margin: 0; width: auto; background: #c0392b;" onclick="deletePromoCode('${p.code}')">刪除</button>
                </div>
            </td>
        </tr>
    `).join('');
}

window.openPromoModal = function (code) {
    if (code) {
        const p = promosCache.find(x => x.code === code);
        if (!p) return;
        document.getElementById('promoModalTitle').innerText = '編輯優惠碼';
        document.getElementById('promoCode').value = p.code;
        document.getElementById('promoCode').disabled = true;
        document.getElementById('promoDesc').value = p.description || '';
        document.getElementById('promoReferral').value = p.referral || '';
        document.getElementById('promoStatus').value = p.status || 'Active';
    } else {
        document.getElementById('promoModalTitle').innerText = '新增優惠碼';
        document.getElementById('promoCode').value = '';
        document.getElementById('promoCode').disabled = false;
        document.getElementById('promoDesc').value = '';
        document.getElementById('promoReferral').value = '';
        document.getElementById('promoStatus').value = 'Active';
    }
    document.getElementById('promoModal').classList.remove('hidden');
}

window.closePromoModal = function () {
    document.getElementById('promoModal').classList.add('hidden');
}

window.savePromoCode = async function () {
    const code = document.getElementById('promoCode').value;
    const description = document.getElementById('promoDesc').value;
    const referralId = document.getElementById('promoReferral').value;
    const status = document.getElementById('promoStatus').value;

    if (!code) {
        alert('請填寫優惠碼');
        return;
    }

    try {
        await apiPost('updatePromoCode', { code, description, referralId, status });
        closePromoModal();
        loadData();
    } catch (err) {
        alert('儲存失敗：' + err.message);
    }
}

window.deletePromoCode = async function (code) {
    if (!confirm('確定要刪除此優惠碼嗎？')) return;
    try {
        await apiPost('deletePromoCode', { code });
        loadData();
    } catch (err) {
        alert('刪除失敗：' + err.message);
    }
}

window.openEditModal = function (id) {
    const d = designersCache.find(x => x.ID === id);
    if (!d) return;

    document.getElementById('modalTitle').innerText = '編輯設計師';
    document.getElementById('editDesignerId').value = d.ID || '';
    document.getElementById('designerName').value = d.Name || '';
    document.getElementById('designerSpecialty').value = d.Specialty || '';
    document.getElementById('designerStartHour').value = d.StartHour || '10';
    document.getElementById('designerEndHour').value = d.EndHour || '20';
    document.getElementById('designerOffDays').value = d.OffDays || 'Monday';
    document.getElementById('designerSlotInterval').value = d.SlotInterval || '30';
    document.getElementById('designerGroupId').value = d.GroupID || '';
    document.getElementById('designerPhoto').value = d.Photo || '';

    document.getElementById('designerModal').classList.remove('hidden');
}

window.addDesigner = function () {
    document.getElementById('modalTitle').innerText = '新增設計師';
    document.getElementById('editDesignerId').value = '';
    document.getElementById('designerName').value = '';
    document.getElementById('designerSpecialty').value = '';
    document.getElementById('designerStartHour').value = '10';
    document.getElementById('designerEndHour').value = '20';
    document.getElementById('designerOffDays').value = 'Monday';
    document.getElementById('designerSlotInterval').value = '30';
    document.getElementById('designerGroupId').value = '';
    document.getElementById('designerPhoto').value = '';
    document.getElementById('designerModal').classList.remove('hidden');
}

window.closeModal = function () {
    document.getElementById('designerModal').classList.add('hidden');
}

window.saveDesigner = async function () {
    const id = document.getElementById('editDesignerId').value;
    const name = document.getElementById('designerName').value;
    const specialty = document.getElementById('designerSpecialty').value;
    const startHour = document.getElementById('designerStartHour').value;
    const endHour = document.getElementById('designerEndHour').value;
    const offDays = document.getElementById('designerOffDays').value;
    const slotInterval = document.getElementById('designerSlotInterval').value;
    const groupId = document.getElementById('designerGroupId').value;
    const photo = document.getElementById('designerPhoto').value;

    if (!name || !specialty) {
        alert('請填寫姓名與專業領域');
        return;
    }

    try {
        await apiPost('updateDesigner', { id, name, specialty, startHour, endHour, offDays, slotInterval, groupId, photo });
        closeModal();
        loadData();
    } catch (err) {
        alert('儲存失敗：' + err.message);
    }
}

// GROUP MANAGEMENT LOGIC
function renderGroupAdmin(groups) {
    groupsCache = groups;
    const container = document.getElementById('group-list-admin');
    if (!container || !groups) return;

    container.innerHTML = groups.map(g => `
        <tr>
            <td><strong>${g.Name}</strong></td>
            <td><small>${g.Slots}</small></td>
            <td>
                <button class="btn-primary" style="padding: 5px 10px; font-size: 12px;" onclick="openGroupModal('${g.GroupID}')">編輯</button>
            </td>
        </tr>
    `).join('');
}

window.openGroupModal = function (id) {
    if (id) {
        const g = groupsCache.find(x => x.GroupID === id);
        if (!g) return;
        document.getElementById('groupModalTitle').innerText = '編輯時段群組';
        document.getElementById('editGroupId').value = g.GroupID;
        document.getElementById('groupName').value = g.Name;
        document.getElementById('groupSlots').value = g.Slots;
    } else {
        document.getElementById('groupModalTitle').innerText = '新增時段群組';
        document.getElementById('editGroupId').value = '';
        document.getElementById('groupName').value = '';
        document.getElementById('groupSlots').value = '10:00,11:00,12:00,14:00,15:00,16:00';
    }
    document.getElementById('groupModal').classList.remove('hidden');
}

window.closeGroupModal = function () {
    document.getElementById('groupModal').classList.add('hidden');
}

window.saveSlotGroup = async function () {
    const id = document.getElementById('editGroupId').value;
    const name = document.getElementById('groupName').value;
    const slots = document.getElementById('groupSlots').value;

    if (!name || !slots) {
        alert('請填寫群組名稱與時段');
        return;
    }

    try {
        await apiPost('updateSlotGroup', { id, name, slots });
        closeGroupModal();
        loadData();
    } catch (err) {
        alert('儲存失敗：' + err.message);
    }
}

window.deleteDesigner = async function (id) {
    if (!confirm('確定要刪除這位設計師嗎？此操作無法還原。')) return;
    try {
        await apiPost('deleteDesigner', { id });
        loadData();
    } catch (err) {
        alert('刪除失敗：' + err.message);
    }
}

window.updateStatus = async function (bookingId, status) {
    try {
        await apiPost('updateBookingStatus', { bookingId, status });
        loadData();
    } catch (err) {
        alert('更新失敗：' + err.message);
    }
}

window.updateDesignerField = async function (id, field, value) {
    try {
        await apiPost('updateDesigner', { id, [field]: value });
    } catch (err) {
        alert('更新失敗：' + err.message);
    }
}

window.loadData = loadData;

// Initial Load
window.onload = loadData;
