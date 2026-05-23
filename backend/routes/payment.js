const { Hono } = require('hono');
const router = new Hono();
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

let _dbClient = null;
const supabase = new Proxy({}, {
  get(_, prop) {
    if (!_dbClient) _dbClient = createClient(process.env.SUPABASE_URL || 'https://placeholder.supabase.co', process.env.ANON_KEY || 'placeholder_key');
    const val = _dbClient[prop];
    return typeof val === 'function' ? val.bind(_dbClient) : val;
  }
});

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getPayPalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('PayPal token error:', text);
    throw new Error('Failed to get PayPal access token');
  }
  const data = await res.json();
  return data.access_token;
}

async function uploadFileToCloudinary(file, folder) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const mimeType = file.type || 'application/octet-stream';
  const dataUri = `data:${mimeType};base64,${base64}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const crypto = require('crypto');
  const signature = crypto
    .createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');
  const formData = new FormData();
  formData.append('file', dataUri);
  formData.append('folder', folder);
  formData.append('timestamp', timestamp);
  formData.append('api_key', apiKey);
  formData.append('signature', signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  return await res.json();
}

const authenticateUser = async (c, next) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) {
    return c.json({ success: false, message: 'No token provided' }, 401);
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    c.set('user', decoded);
    await next();
  } catch (error) {
    console.error('JWT Authentication error:', error.message);
    return c.json({ success: false, message: 'Invalid token', error: error.message }, 401);
  }
};

router.post('/paypal/create', authenticateUser, async (c) => {
  try {
    const { plan, amount } = await c.req.json();
    const userEmail = c.get('user').email;

    if (!plan || !amount) {
      return c.json({ success: false, message: 'Plan and amount are required' }, 400);
    }

    const reqUrl = new URL(c.req.url);
    const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;

    const order = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: amount.toString()
        },
        description: `Onraiser ${plan} Premium Subscription`,
        custom_id: `${userEmail}_${plan}_${Date.now()}`
      }],
      application_context: {
        return_url: `${baseUrl}/api/payment/paypal/success`,
        cancel_url: `${baseUrl}/api/payment/paypal/cancel`,
        brand_name: 'Onraiser',
        landing_page: 'BILLING',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
        payment_method: {
          payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED',
          payer_selected: 'PAYPAL'
        }
      }
    };

    const accessToken = await getPayPalAccessToken();

    const orderRes = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(order)
    });
    const orderData = await orderRes.json();

    await supabase
      .from('pending_premium_subscriptions')
      .insert({
        user_email: userEmail,
        payment_method: 'paypal',
        amount: parseFloat(amount),
        currency: 'USD',
        transaction_reference: orderData.id,
        plan: plan,
        status: 'pending',
        requested_at: new Date().toISOString(),
        paypal_order_id: orderData.id
      });

    const approvalUrl = orderData.links.find(link => link.rel === 'approve');

    if (!approvalUrl) {
      throw new Error('No approval URL found in PayPal response');
    }

    return c.json({
      success: true,
      approval_url: approvalUrl.href,
      order_id: orderData.id
    });

  } catch (error) {
    console.error('PayPal order creation error:', error);
    return c.json({ success: false, message: 'Failed to create PayPal order' }, 500);
  }
});

router.get('/paypal/success', async (c) => {
  try {
    const { PayerID, paymentId, token } = c.req.query();

    if (!paymentId) {
      return c.redirect('/subscriptions.html?status=error&message=Missing payment ID');
    }

    const accessToken = await getPayPalAccessToken();

    const captureRes = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${paymentId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: '{}'
    });
    const orderData = await captureRes.json();

    if (orderData.status === 'COMPLETED') {
      const { data: pendingSubscription, error } = await supabase
        .from('pending_premium_subscriptions')
        .select('*')
        .eq('paypal_order_id', paymentId)
        .single();

      if (!error && pendingSubscription) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('email', pendingSubscription.user_email)
          .single();

        if (user) {
          let endDate = new Date();
          switch (pendingSubscription.plan) {
            case 'weekly':
              endDate.setDate(endDate.getDate() + 7);
              break;
            case 'monthly':
              endDate.setMonth(endDate.getMonth() + 1);
              break;
            case 'yearly':
              endDate.setFullYear(endDate.getFullYear() + 1);
              break;
            default:
              endDate.setMonth(endDate.getMonth() + 1);
          }

          const now = new Date().toISOString();
          const endDateStr = endDate.toISOString();

          const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

          if (existingSub) {
            await supabase
              .from('subscriptions')
              .update({
                plan: 'premium',
                status: 'active',
                start_date: now,
                end_date: endDateStr,
                amount_paid: pendingSubscription.amount,
                currency: 'USD',
                payment_method: 'paypal',
                paypal_order_id: paymentId
              })
              .eq('id', existingSub.id);
          } else {
            await supabase
              .from('subscriptions')
              .insert({
                user_id: user.id,
                user_email: pendingSubscription.user_email,
                plan: 'premium',
                status: 'active',
                start_date: now,
                end_date: endDateStr,
                amount_paid: pendingSubscription.amount,
                currency: 'USD',
                payment_method: 'paypal',
                paypal_order_id: paymentId
              });
          }

          await supabase
            .from('users')
            .update({ subscription: 'premium' })
            .eq('id', user.id);

          await supabase
            .from('pending_premium_subscriptions')
            .update({
              status: 'approved',
              reviewed_at: new Date().toISOString(),
              admin_message: 'Payment completed successfully via PayPal'
            })
            .eq('id', pendingSubscription.id);
        }
      }

      return c.redirect('/subscriptions.html?status=success&message=Payment completed successfully');
    } else {
      return c.redirect('/subscriptions.html?status=error&message=Payment not completed');
    }
  } catch (error) {
    console.error('PayPal success callback error:', error);
    return c.redirect('/subscriptions.html?status=error&message=Payment processing failed');
  }
});

router.get('/paypal/cancel', async (c) => {
  return c.redirect('/subscriptions.html?status=cancelled&message=Payment was cancelled');
});

router.post('/crypto/verify', authenticateUser, async (c) => {
  try {
    const body = await c.req.parseBody({ all: true });
    const { plan, amount, crypto_type, transaction_id } = body;
    const proofFile = body['transaction_proof'];
    const userEmail = c.get('user').email;

    if (!plan || !amount || !crypto_type || !transaction_id || !proofFile) {
      return c.json({ success: false, message: 'All fields and transaction proof are required' }, 400);
    }

    const proofUpload = await uploadFileToCloudinary(proofFile, 'payment_proofs');

    const { error } = await supabase
      .from('pending_premium_subscriptions')
      .insert({
        user_email: userEmail,
        payment_method: 'crypto',
        payment_proof_url: proofUpload.secure_url,
        amount: parseFloat(amount),
        currency: crypto_type,
        transaction_reference: transaction_id,
        plan: plan,
        status: 'pending',
        requested_at: new Date().toISOString(),
        crypto_type: crypto_type
      });

    if (error) {
      console.error('Database error:', error);
      return c.json({ success: false, message: 'Database error' }, 500);
    }

    return c.json({
      success: true,
      message: 'Crypto payment submitted for review. Admin will verify and approve within 24 hours.'
    });
  } catch (error) {
    console.error('Crypto payment verification error:', error);
    return c.json({ success: false, message: 'Failed to verify crypto payment' }, 500);
  }
});

router.post('/mpesa/verify', authenticateUser, async (c) => {
  try {
    const body = await c.req.parseBody({ all: true });
    const { plan, amount, transaction_id, phone_number } = body;
    const proofFile = body['payment_proof'];
    const userEmail = c.get('user').email;

    if (!plan || !amount || !transaction_id || !phone_number || !proofFile) {
      return c.json({ success: false, message: 'All fields and payment proof are required' }, 400);
    }

    const proofUpload = await uploadFileToCloudinary(proofFile, 'payment_proofs');

    const { error } = await supabase
      .from('pending_premium_subscriptions')
      .insert({
        user_email: userEmail,
        payment_method: 'mpesa',
        payment_proof_url: proofUpload.secure_url,
        amount: parseFloat(amount),
        currency: 'KES',
        transaction_reference: transaction_id,
        plan: plan,
        status: 'pending',
        requested_at: new Date().toISOString(),
        phone_number: phone_number
      });

    if (error) {
      console.error('Database error:', error);
      return c.json({ success: false, message: 'Database error' }, 500);
    }

    return c.json({
      success: true,
      message: 'M-Pesa payment submitted for review. Admin will verify and approve within 24 hours.'
    });
  } catch (error) {
    console.error('M-Pesa payment verification error:', error);
    return c.json({ success: false, message: 'Failed to verify M-Pesa payment' }, 500);
  }
});

router.get('/status/:reference', authenticateUser, async (c) => {
  try {
    const reference = c.req.param('reference');
    const userEmail = c.get('user').email;

    const { data: payment, error } = await supabase
      .from('pending_premium_subscriptions')
      .select('*')
      .eq('transaction_reference', reference)
      .eq('user_email', userEmail)
      .single();

    if (error || !payment) {
      return c.json({ success: false, message: 'Payment not found' }, 404);
    }

    return c.json({
      success: true,
      payment: {
        status: payment.status,
        plan: payment.plan,
        amount: payment.amount,
        currency: payment.currency,
        payment_method: payment.payment_method,
        requested_at: payment.requested_at,
        reviewed_at: payment.reviewed_at,
        admin_message: payment.admin_message
      }
    });
  } catch (error) {
    console.error('Payment status error:', error);
    return c.json({ success: false, message: 'Failed to get payment status' }, 500);
  }
});

module.exports = router;
