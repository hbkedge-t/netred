/**
 * LINE Beauty Reservation System - Frontend Logic
 */

const GAS_APP_URL = 'https://script.google.com/macros/s/AKfycbywQ3IRjhFWeOw6vbAK4b-TI_Whl2tRyzjHlB-xdYxHZqnHFcjKgu_PjJMv1t8fKQIv/exec';

let currentStep = 1;
let selectedData = {
  promoCode: null,
  designerId: null, // Assigned by backend or default
  designerName: null,
  serviceName: null,
  date: null,
  time: null,
  amount: 0,
  duration: 60,
  userId: 'MOCK_USER_ID',
  userName: 'MOCK_USER_NAME',
  clientName: '',
  clientPhone: ''
};

/**
 * LIFF Initialization
 */
async function initLiff() {
  try {
    await liff.init({ liffId: '2009603120-Xi7ibdX7' });
    if (!liff.isLoggedIn()) {
      liff.login();
    } else {
      const profile = await liff.getProfile();
      selectedData.userId = profile.userId;
      selectedData.userName = profile.displayName;
      selectedData.clientName = profile.displayName; // Default to LINE name

      // Update User Profile in GAS (Module 3 CRM)
      await apiPost('updateUser', { userId: profile.userId, displayName: profile.displayName });
      
      // Set today's date as default
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('dateInput').value = today;
      selectedData.date = today;

      // Auto-focus promo code input
      document.getElementById('promoCodeInput').value = '';
      document.getElementById('nextBtn').disabled = false;
    }
  } catch (err) {
    console.error('LIFF Init Error:', err);
    document.getElementById('nextBtn').disabled = false;
  }
}

/**
 * Tab/View Controller
 */
function switchView(view) {
  const historySection = document.getElementById('history-view');
  const indicators = document.querySelector('.step-indicator');

  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

  if (view === 'booking') {
    document.getElementById('nav-booking').classList.add('active');
    historySection.classList.add('hidden');
    indicators.classList.remove('hidden');
    document.getElementById(`step${currentStep}`).classList.remove('hidden');
    document.getElementById('nextBtn').classList.remove('hidden');
  } else {
    document.getElementById('nav-history').classList.add('active');
    historySection.classList.remove('hidden');
    indicators.classList.add('hidden');
    // Hide all steps
    [1, 2, 3, 4].forEach(i => document.getElementById(`step${i}`).classList.add('hidden'));
    document.getElementById('nextBtn').classList.add('hidden');
    loadHistory();
  }
}

/**
 * API Helpers
 */
async function apiGet(action, params = {}) {
  const query = new URLSearchParams({ action, ...params }).toString();
  const response = await fetch(`${GAS_APP_URL}?${query}`);
  const text = await response.text(); // Read once
  try {
    const result = JSON.parse(text);
    if (result.success) return result.data;
    throw new Error(result.error || 'Backend Error');
  } catch (e) {
    console.error('API Response Text:', text);
    if (text.includes('script.google.com')) {
      throw new Error('伺服器環境錯誤 (500)，請檢查 GAS 部署權限或試算表 ID');
    }
    throw new Error(`解析失敗: ${e.message || '未知錯誤'}`);
  }
}

async function apiPost(action, data) {
  const response = await fetch(`${GAS_APP_URL}?action=${action}`, {
    method: 'POST',
    body: JSON.stringify(data)
  });
  const text = await response.text();
  try {
    const result = JSON.parse(text);
    if (result.success) return result.data;
    throw new Error(result.error || 'Backend Error');
  } catch (e) {
    console.error('API Post Response Text:', text);
    throw new Error(`操作失敗: ${e.message || '伺服器無回應'}`);
  }
}

/**
 * Step 1: Promo Code Verification
 */
async function verifyPromoCode() {
  const code = document.getElementById('promoCodeInput').value.trim();
  const msgEl = document.getElementById('promo-msg');
  if (!code) {
    msgEl.innerText = '請輸入優惠碼';
    msgEl.style.color = 'orange';
    return false;
  }

  try {
    msgEl.innerText = '正在驗證...';
    msgEl.className = 'msg-loading';
    const result = await apiGet('verifyPromoCode', { code });
    if (result.valid) {
      selectedData.promoCode = code;
      msgEl.innerText = '✅ 驗證成功！';
      msgEl.style.color = '#c5a059';
      return true;
    } else {
      msgEl.innerText = '❌ ' + result.message;
      msgEl.style.color = '#ff4d4d';
      return false;
    }
  } catch (err) {
    msgEl.innerText = '❌ 系統錯誤: ' + err.message;
    msgEl.style.color = '#ff4d4d';
    return false;
  }
}

/**
 * Step 2: Service Selection
 */
async function loadServices() {
  const container = document.getElementById('service-list');
  container.innerHTML = '<div class="loading">正在載入課程...</div>';
  try {
    const services = await apiGet('getServices');
    container.innerHTML = services.map(s => {
      const sanitizedId = s.Name.replace(/\s+/g, '');
      return `
      <div class="card" onclick="selectService('${s.Name}', ${s.Price}, ${s.DurationMin})" id="s-${sanitizedId}">
        <div style="font-weight: 600;">${s.Name}</div>
        <div style="display: flex; justify-content: space-between; font-size: 14px; margin-top: 8px;">
          <span>${s.DurationMin} 分鐘</span>
          <span style="color: var(--primary);">NT$ ${s.Price}</span>
        </div>
      </div>
    `;
    }).join('');
  } catch (err) { container.innerHTML = '無法加載數據'; }
}

function selectService(name, price, duration) {
  selectedData.serviceName = name;
  selectedData.amount = price;
  selectedData.duration = duration;
  document.querySelectorAll('.item-list .card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`s-${name.replace(/\s+/g, '')}`).classList.add('selected');
  document.getElementById('nextBtn').disabled = false;
}

/**
 * Step 3: Date & Time Selection
 */
async function loadSlots() {
  const container = document.getElementById('slot-list');
  const dateStr = document.getElementById('dateInput').value;
  if (!dateStr) return;

  selectedData.date = dateStr;
  selectedData.time = null;
  document.getElementById('nextBtn').disabled = true;
  container.innerHTML = '<div style="grid-column: span 3; text-align: center; color: grey;">載入時段中...</div>';

  try {
    // We don't pass designerId anymore, let backend pick default
    const slots = await apiGet('getAvailableSlots', { date: dateStr });
    if (slots.length === 0) {
      container.innerHTML = '<div style="grid-column: span 3; text-align: center; color: grey; padding: 20px;">此日期尚無可預約時段</div>';
      return;
    }
    
    // Use the designerId returned from the first slot for booking
    if (slots[0].designerId) {
       selectedData.designerId = slots[0].designerId;
    }

    container.innerHTML = slots.map(s => {
      const cls = s.available ? '' : 'disabled';
      const attr = s.available ? `onclick="selectSlot('${s.time}')"` : '';
      const label = s.available ? s.time : `${s.time} (已預訂)`;
      return `<div class="slot ${cls}" ${attr} id="t-${s.time.replace(/[: ]/g, '')}">${label}</div>`;
    }).join('');
  } catch (err) { container.innerHTML = '無法加載數據'; }
}

function selectSlot(time) {
  selectedData.time = time;
  document.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
  const targetId = `t-${time.replace(/[: ]/g, '')}`;
  const el = document.getElementById(targetId);
  if (el) el.classList.add('selected');
  document.getElementById('nextBtn').disabled = false;
}

/**
 * Booking History
 */
async function loadHistory() {
  const container = document.getElementById('booking-history');
  container.innerHTML = '<div style="text-align:center; padding: 20px;">載入中...</div>';
  try {
    const bookings = await apiGet('getBookings', { userId: selectedData.userId });
    if (bookings.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 20px; color: grey;">尚無預約紀錄</div>';
      return;
    }
    container.innerHTML = bookings.map(b => {
      const bDate = new Date(b.DateTime);
      const isCancelable = (bDate - new Date()) > 24 * 60 * 60 * 1000;
      return `
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
              <div style="font-weight:600; color: var(--primary);">${b.ServiceName}</div>
              <small style="color: grey;">${b.DateTime}</small>
            </div>
            <span class="status-badge ${b.Status.toLowerCase().replace(/ /g, '-')}">${b.Status}</span>
          </div>
          ${(b.Status === 'Pending' || b.Status === 'Confirmed') && isCancelable ?
          `<button class="btn-cancel" onclick="cancelBooking('${b.ID}')">取消預約</button>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) { container.innerHTML = '無法載入紀錄'; }
}

async function cancelBooking(bookingId) {
  if (!confirm('確定要取消這項預約嗎？\n(提前 24 小時前取消不扣款)')) return;
  try {
    await apiPost('cancelBooking', { bookingId, userId: selectedData.userId });
    loadHistory();
  } catch (err) { alert('取消失敗：' + err.message); }
}

/**
 * Navigation Logic
 */
const btn = document.getElementById('nextBtn'); // Global ref

btn.onclick = async () => {
  if (currentStep === 1) {
    btn.disabled = true;
    const ok = await verifyPromoCode();
    if (ok) {
      loadServices();
      transitionStep(1, 2);
    } else {
      btn.disabled = false;
    }
  } else if (currentStep === 2) {
    if (selectedData.serviceName) {
      transitionStep(2, 3);
    }
  } else if (currentStep === 3) {
    if (selectedData.time) {
      transitionStep(3, 4);
      showSummary();
      // Set default values for step 4
      document.getElementById('clientName').value = selectedData.clientName || selectedData.userName;
    }
  } else if (currentStep === 4) {
    const name = document.getElementById('clientName').value.trim();
    const phone = document.getElementById('clientPhone').value.trim();
    if (!name || !phone) {
      alert('請填寫姓名與電話');
      return;
    }
    selectedData.clientName = name;
    selectedData.clientPhone = phone;
    finalizeBooking();
  }
};

function transitionStep(from, to) {
  document.getElementById(`step${from}`).classList.add('hidden');
  document.getElementById(`step${to}`).classList.remove('hidden');
  document.getElementById(`s${to}`).classList.add('active');
  document.getElementById('nextBtn').disabled = true;
  
  if (to === 3) {
    loadSlots(); // Auto-load when moving to date/time step
  }
  
  if (to === 4) btn.innerText = '立即預約並支付訂金';
  else btn.innerText = '下一步';
  
  currentStep = to;
}

function showSummary() {
  const container = document.getElementById('summary');
  container.innerHTML = `
    <div class="card" style="border: none; background: rgba(255,255,255,0.02); padding: 5px 0;">
      <small style="color: grey;">優惠碼</small>
      <div style="font-weight: 600;">${selectedData.promoCode}</div>
    </div>
    <div class="card" style="border: none; background: rgba(255,255,255,0.02); padding: 5px 0;">
      <small style="color: grey;">課程項目</small>
      <div style="font-weight: 600;">${selectedData.serviceName}</div>
    </div>
    <div class="card" style="border: none; background: rgba(255,255,255,0.02); padding: 5px 0;">
      <small style="color: grey;">預約時間</small>
      <div style="font-weight: 600;">${selectedData.date} ${selectedData.time}</div>
    </div>
  `;
  document.getElementById('nextBtn').disabled = false;
}

async function finalizeBooking() {
  try {
    btn.disabled = true;
    btn.innerText = '正在處理支付...';

    const payload = {
      ...selectedData,
      name: selectedData.clientName,
      phone: selectedData.clientPhone,
      dateTime: `${selectedData.date} ${selectedData.time}`
    };

    await apiPost('createBooking', payload);

    document.getElementById('app').innerHTML = `
      <div class="card" style="text-align: center; margin-top: 50px;">
        <div style="font-size: 60px; color: var(--primary); margin-bottom: 20px;">✓</div>
        <h2>預約成功！</h2>
        <p style="color: grey; margin: 15px 0;">感謝您的預約，系統已自動為您排班。</p>
        <button class="btn-primary" onclick="liff.closeWindow()">關閉並返回 LINE</button>
      </div>
    `;
  } catch (err) {
    alert('操作失敗：' + err.message);
    btn.disabled = false;
  }
}

// Listeners
document.getElementById('dateInput').addEventListener('change', loadSlots);
window.switchView = switchView;
window.cancelBooking = cancelBooking;

// Load
initLiff();
