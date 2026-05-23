let selectedPlan = null;
let selectedPaymentMethod = null;
let isOnboarding = false;

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem("token");
  if (!token) { window.location.href = "login.html"; return; }

  const urlParams = new URLSearchParams(window.location.search);
  const banner = document.getElementById('noSubscriptionBanner');

  // Check subscription status
  let subscriptionStatus = 'free';
  try {
    const subRes = await fetch(`${config.API_BASE_URL}/api/user/subscription-status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (subRes.ok) {
      const subData = await subRes.json();
      subscriptionStatus = subData.subscription || 'free';
    }
  } catch (e) { console.error('Subscription check error:', e); }

  // If PayPal returned successfully and user now has premium, proceed to personal
  if (urlParams.get('status') === 'success' && subscriptionStatus === 'premium') {
    window.location.href = 'personal.html';
    return;
  }

  // If user already has premium, check their step
  if (subscriptionStatus === 'premium') {
    try {
      const progressRes = await fetch(`${config.API_BASE_URL}/api/user/progress`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (progressRes.ok) {
        const progress = await progressRes.json();
        if (progress.current_step === 'subscription' || progress.current_step === 'personal') {
          window.location.href = 'personal.html';
          return;
        }
      }
    } catch (e) { console.error('Progress check error:', e); }
  }

  // Check for pending subscription
  if (subscriptionStatus !== 'premium') {
    try {
      const pendRes = await fetch(`${config.API_BASE_URL}/api/user/pending-subscription`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (pendRes.ok) {
        const pendData = await pendRes.json();
        if (pendData.pending) {
          if (banner) {
            banner.style.background = '#0984e3';
            banner.textContent = `Your ${pendData.plan} plan payment is pending admin approval. You will be notified once activated.`;
            banner.style.display = 'block';
          }
          document.querySelectorAll('.subscribe-btn').forEach(btn => {
            btn.disabled = true; btn.style.opacity = '0.5';
          });
          document.querySelectorAll('.payment-option').forEach(opt => {
            opt.style.pointerEvents = 'none'; opt.style.opacity = '0.5';
          });
        } else {
          if (banner) {
            banner.textContent = 'Please choose a payment method, then select a plan to continue.';
            banner.style.display = 'block';
          }
        }
      }
    } catch (e) {
      if (banner) {
        banner.textContent = 'Please choose a plan to continue. No free plan is available.';
        banner.style.display = 'block';
      }
    }
  }

  // Check onboarding step
  try {
    const progressRes = await fetch(`${config.API_BASE_URL}/api/user/progress`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (progressRes.ok) {
      const progress = await progressRes.json();
      isOnboarding = progress.current_step === 'subscription';
      if (!isOnboarding && subscriptionStatus === 'premium') {
        document.getElementById('backLink').style.display = 'inline-block';
      }
    }
  } catch (e) { console.error('Progress check error:', e); }

  // Check if manual payment is enabled for this user
  try {
    const profileRes = await fetch(`${config.API_BASE_URL}/api/user/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      const user = profileData.user || profileData;
      if (user.smoking === 'manual_enabled') {
        const manualOpt = document.getElementById('manualPaymentOption');
        if (manualOpt) manualOpt.style.display = '';
      }
    }
  } catch (e) { console.error('Profile check error:', e); }

  await loadCurrentSubscription();
});

async function loadCurrentSubscription() {
  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`${config.API_BASE_URL}/api/user/subscription`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.ok) {
      const subscription = await response.json();
      updateUIForCurrentPlan(subscription);
    }
  } catch (error) { console.error('Error loading subscription:', error); }
}

function updateUIForCurrentPlan(subscription) {
  const currentPlan = subscription.plan;
  if (isOnboarding || !currentPlan) return;

  const planCards = document.querySelectorAll('.pricing-card');
  const planNames = ['weekly', 'monthly', 'yearly'];

  planCards.forEach((card, index) => {
    const btn = card.querySelector('.subscribe-btn');
    if (!btn) return;
    if (planNames[index] === currentPlan) {
      btn.textContent = 'Current Plan';
      btn.className = 'subscribe-btn current-plan';
      btn.disabled = true;
    }
  });
}

function selectPlan(plan, price) {
  selectedPlan = { plan, price };

  if (!selectedPaymentMethod) {
    alert('Please select a payment method first (Step 1 above).');
    return;
  }

  openPaymentModal();
}

function selectPaymentMethod(method, el) {
  selectedPaymentMethod = method;
  document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');

  const hint = document.getElementById('methodHint');
  if (hint) hint.style.display = 'none';
}

function openPaymentModal() {
  if (!selectedPlan || !selectedPaymentMethod) {
    alert('Please select both a payment method and a plan.');
    return;
  }

  const modal = document.getElementById('paymentModal');
  document.getElementById('modalTitle').textContent =
    `${selectedPlan.plan.charAt(0).toUpperCase() + selectedPlan.plan.slice(1)} Plan – $${selectedPlan.price}`;

  switch (selectedPaymentMethod) {
    case 'paypal':
    case 'card':    document.getElementById('modalBody').innerHTML = createPayPalForm(); break;
    case 'manual':  document.getElementById('modalBody').innerHTML = createManualForm(); break;
  }

  modal.style.display = 'flex';
}

function closePaymentModal() {
  document.getElementById('paymentModal').style.display = 'none';
}

function createPayPalForm() {
  const isCard = selectedPaymentMethod === 'card';
  const label  = isCard ? 'Pay by Card via PayPal' : 'Pay with PayPal';
  const note   = isCard
    ? 'You will be redirected to PayPal where you can enter your debit or credit card details securely.'
    : 'You will be redirected to PayPal to pay with your PayPal account or a saved card.';
  return `
    <div class="payment-info">
      <p><strong>Plan:</strong> ${selectedPlan.plan.charAt(0).toUpperCase() + selectedPlan.plan.slice(1)}</p>
      <p><strong>Amount:</strong> $${selectedPlan.price}</p>
      <p><strong>Method:</strong> ${isCard ? 'Debit / Credit Card (via PayPal)' : 'PayPal'}</p>
    </div>
    <p style="font-size:0.9rem;color:#555;margin-top:8px;">${note}</p>
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button class="subscribe-btn" onclick="processPayPalPayment()" style="flex:1;">
        <span id="paypalSpinner" class="spinner"></span>${label}
      </button>
      <button class="subscribe-btn" onclick="closePaymentModal()" style="background:#6c757d;flex:1;">Cancel</button>
    </div>
  `;
}

function createManualForm() {
  return `
    <div class="payment-info">
      <p><strong>Plan:</strong> ${selectedPlan.plan.charAt(0).toUpperCase() + selectedPlan.plan.slice(1)}</p>
      <p><strong>Amount:</strong> $${selectedPlan.price}</p>
    </div>
    <div style="background:#fff3cd;padding:14px;border-radius:8px;margin:14px 0;font-size:0.9rem;">
      <p><strong>Manual Payment Instructions:</strong></p>
      <p>1. Make your payment using the details provided to you.</p>
      <p>2. Enter your phone number and transaction reference below.</p>
      <p>3. Upload a screenshot or photo of your payment receipt.</p>
      <p>4. Admin will verify and activate your plan within 24 hours.</p>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label style="display:block;font-size:13px;font-weight:600;color:#444;margin-bottom:5px;">Phone Number <span style="color:#888;font-weight:400;">(used for the payment)</span></label>
      <input type="tel" id="manualPhone" placeholder="e.g. +254712345678"
             style="width:100%;padding:10px 12px;border:1.5px solid #d0dce8;border-radius:6px;font-size:14px;box-sizing:border-box;">
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label style="display:block;font-size:13px;font-weight:600;color:#444;margin-bottom:5px;">Transaction Reference <span style="color:#888;font-weight:400;">(optional)</span></label>
      <input type="text" id="manualTransactionId" placeholder="e.g. REF123456"
             style="width:100%;padding:10px 12px;border:1.5px solid #d0dce8;border-radius:6px;font-size:14px;box-sizing:border-box;">
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label style="display:block;font-size:13px;font-weight:600;color:#444;margin-bottom:5px;">Payment Screenshot / Proof <span style="color:#dc3545;font-size:12px;">*</span></label>
      <input type="file" id="manualProof" accept="image/*"
             style="width:100%;padding:8px;border:1.5px dashed #007bff;border-radius:6px;background:#f0f7ff;font-size:13px;box-sizing:border-box;">
      <small style="color:#888;font-size:11px;margin-top:4px;display:block;">Upload a photo or screenshot of your payment confirmation.</small>
    </div>
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button class="subscribe-btn" onclick="processManualPayment()" style="flex:1;">
        <span id="manualSpinner" class="spinner"></span>Submit Payment
      </button>
      <button class="subscribe-btn" onclick="closePaymentModal()" style="background:#6c757d;flex:1;">Cancel</button>
    </div>
  `;
}

async function processPayPalPayment() {
  const spinner = document.getElementById('paypalSpinner');
  spinner.style.display = 'inline-block';
  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`${config.API_BASE_URL}/api/payment/paypal/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan: selectedPlan.plan, amount: selectedPlan.price })
    });
    const data = await response.json();
    if (response.ok && data.success) {
      window.location.href = data.approval_url;
    } else {
      alert(data.message || 'Payment processing failed. Please try again.');
    }
  } catch (error) {
    alert('Network error. Please try again.');
  } finally {
    spinner.style.display = 'none';
  }
}

async function processManualPayment() {
  const transactionId = (document.getElementById('manualTransactionId')?.value || '').trim();
  const phoneNumber   = (document.getElementById('manualPhone')?.value || '').trim();
  const proofFile     = document.getElementById('manualProof')?.files[0];
  const spinner       = document.getElementById('manualSpinner');

  if (!proofFile) {
    alert('Please upload a payment screenshot or proof.');
    return;
  }

  spinner.style.display = 'inline-block';

  try {
    const formData = new FormData();
    formData.append('plan', selectedPlan.plan);
    formData.append('amount', selectedPlan.price);
    if (transactionId) formData.append('transaction_id', transactionId);
    if (phoneNumber)   formData.append('phone_number', phoneNumber);
    formData.append('payment_proof', proofFile);

    const token = localStorage.getItem("token");
    const response = await fetch(`${config.API_BASE_URL}/api/payment/mpesa/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    if (response.ok) {
      closePaymentModal();
      showNotification('Payment submitted! Admin will review and activate your plan within 24 hours. You will be notified by email.');
      setTimeout(() => window.location.reload(), 3000);
    } else {
      const result = await response.json().catch(() => ({}));
      alert('Submission failed: ' + (result.message || 'Please check your details and try again.'));
    }
  } catch (error) {
    alert('Network error. Please try again.');
  } finally {
    spinner.style.display = 'none';
  }
}

function showNotification(message) {
  const n = document.createElement('div');
  n.style.cssText = `
    position:fixed;top:20px;right:20px;background:#00b894;color:white;
    padding:15px 20px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.3);
    z-index:10001;max-width:380px;font-size:0.9rem;line-height:1.4;
  `;
  n.textContent = message;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 8000);
}

document.getElementById('paymentModal').addEventListener('click', function(e) {
  if (e.target === this) closePaymentModal();
});
