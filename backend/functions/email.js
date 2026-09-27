return (async () => {
  const action = String(msg.pciAction || msg.type || "");
  const pool = getPool();
  if (action === "email.test") {
    const session = await requireSession(["provider_admin"]);
    const input = msg.pciTransport === "uibuilder" ? (msg.data || (msg.payload && msg.payload.data) || {}) : parseBody();
    const recipient = String(input.recipient || session.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) throw pciErrors.validation("recipient is invalid.");
    await sendMail({ to: recipient, subject: "FACIS FAP PCI email test", text: `SMTP delivery from the ORCE flow runtime is operational at ${new Date().toISOString()}.` });
    return emit(200, { delivered: true, recipient }, {}, "pci:email-tested");
  }
  if (action === "email.retry") {
    if (!msg.pciInternal) await requireSession(["provider_admin"]);
    const lockName = "email-outbox-retry";
    const lockToken = acquireGlobalLock(lockName, 240000);
    if (!lockToken) return emit(202, { processed: 0, sent: 0, reconciliation: "already-running" }, {}, "pci:email-retry-complete");
    try {
      const pending = await pool.query("SELECT * FROM email_outbox WHERE state IN ('pending','failed') AND next_attempt_at <= now() AND attempts < 5 ORDER BY created_at LIMIT 25");
    let sent = 0;
    for (const item of pending.rows) {
      try {
        const data = item.payload || {};
        await sendMail({ to: item.recipient, subject: data.subject || "FACIS FAP PCI notification", text: data.text || "FACIS FAP PCI notification" });
        await pool.query("UPDATE email_outbox SET state='sent',attempts=attempts+1,last_error=NULL,updated_at=now() WHERE email_id=$1", [item.email_id]);
        sent += 1;
      } catch (error) {
        await pool.query("UPDATE email_outbox SET state='failed',attempts=attempts+1,last_error=$2,next_attempt_at=now() + interval '5 minutes',updated_at=now() WHERE email_id=$1", [item.email_id, "PCI-EMAIL-DELIVERY-FAILED"]);
      }
    }
      return emit(200, { processed: pending.rowCount, sent }, {}, "pci:email-retry-complete");
    } finally {
      releaseGlobalLock(lockName, lockToken);
    }
  }
  throw pciErrors.notFound("Unknown email action.");
})().catch(emitError);
