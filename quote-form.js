(() => {
  const form = document.querySelector('form.quote');
  if (!form) return;
  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('quote-status');
  const label = button.textContent;
  let submitting = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    submitting = true;
    button.disabled = true;
    button.textContent = 'Sending…';
    form.setAttribute('aria-busy', 'true');
    status.textContent = '';
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error('Submission not confirmed');
      // Only a confirmed Formspree success can trigger the conversion page.
      window.location.assign('/thank-you.html');
    } catch {
      // Never reset the form or automatically retry an uncertain submission.
      status.textContent = 'We could not confirm your request was sent. Your details are still here. Please try again, or call 403-650-3466 if you are unsure whether it went through.';
      submitting = false;
      button.disabled = false;
      button.textContent = label;
      form.removeAttribute('aria-busy');
      status.focus();
    }
  });
})();
