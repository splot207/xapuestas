const form = document.getElementById('form-login');
const error = document.getElementById('login-error');

form.addEventListener('submit', async e => {
  e.preventDefault();
  error.hidden = true;

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usuario: document.getElementById('usuario').value.trim(),
      contrasena: document.getElementById('contrasena').value
    })
  });

  if (res.ok) {
    window.location.href = '/';
  } else {
    const data = await res.json().catch(() => ({}));
    error.textContent = data.error || 'No se pudo ingresar';
    error.hidden = false;
  }
});
