
const token = localStorage.getItem("admin_token");

if (!token) {
  alert("Access denied. Please login as admin.");
  window.location.href = "admin-login.html";
}

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const userEmail = urlParams.get('email');
const userName = urlParams.get('name');

// Display user info
document.getElementById('userName').textContent = userName || 'Unknown User';
document.getElementById('userEmail').textContent = userEmail || 'No email';

function showStatus(message, isSuccess = true) {
  const statusElement = document.getElementById('statusMessage');
  statusElement.textContent = message;
  statusElement.className = `status-message ${isSuccess ? 'success' : 'error'}`;
  
  // Clear message after 5 seconds
  setTimeout(() => {
    statusElement.textContent = '';
    statusElement.className = 'status-message';
  }, 5000);
}

async function grantPremium(days) {
  try {
    const response = await fetch(`${config.API_BASE_URL}/api/admin/grant-premium`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: userEmail,
        days: days
      })
    });

    const data = await response.json();

    if (response.ok) {
      showStatus(`✅ Premium access granted for ${days} days!`, true);
    } else {
      showStatus(`❌ Error: ${data.message}`, false);
    }
  } catch (error) {
    console.error('Grant premium error:', error);
    showStatus('❌ Network error occurred', false);
  }
}

async function grantCustomPremium() {
  const customDays = document.getElementById('customDays').value;
  
  if (!customDays || customDays < 1) {
    showStatus('❌ Please enter a valid number of days', false);
    return;
  }

  if (customDays > 3650) {
    showStatus('❌ Maximum 3650 days (10 years) allowed', false);
    return;
  }

  await grantPremium(parseInt(customDays));
}

async function removePremium() {
  if (!confirm(`Are you sure you want to remove premium access from ${userName}?`)) {
    return;
  }

  try {
    const response = await fetch(`${config.API_BASE_URL}/api/admin/remove-premium`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: userEmail
      })
    });

    const data = await response.json();

    if (response.ok) {
      showStatus('✅ Premium access removed successfully!', true);
    } else {
      showStatus(`❌ Error: ${data.message}`, false);
    }
  } catch (error) {
    console.error('Remove premium error:', error);
    showStatus('❌ Network error occurred', false);
  }
}

function goBack() {
  window.location.href = 'admin-dashboard.html';
}

// Add enter key support for custom days input
document.getElementById('customDays').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    grantCustomPremium();
  }
});
