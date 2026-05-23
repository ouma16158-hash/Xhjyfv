(async function () {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.replace('login.html');
    return;
  }

  try {
    const res = await fetch(`${config.API_BASE_URL}/api/user/subscription-status`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      window.location.replace('login.html');
      return;
    }

    const data = await res.json();
    if (data.subscription !== 'premium') {
      window.location.replace('subscriptions.html?reason=no_subscription');
    }
  } catch (err) {
    console.error('Auth guard error:', err);
  }
})();
