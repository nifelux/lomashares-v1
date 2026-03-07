(function () {
  "use strict";

  function showMsg(text, type = "error") {
    const box = document.getElementById("msg");
    if (!box) {
      alert(text);
      return;
    }
    box.textContent = text;
    box.className = "msg " + type;
    box.style.display = "block";
  }

  async function withdraw(e) {
    e.preventDefault();

    try {
      if (!window.LomaAuth) {
        throw new Error("LomaAuth not loaded");
      }

      const session = await window.LomaAuth.requireAuth();
      if (!session) return;

      const userId = session.user.id;
      const amount = Number(document.getElementById("amount")?.value || 0);
      const bank = (document.getElementById("bank")?.value || "").trim();
      const accountName = (document.getElementById("account_name")?.value || "").trim();
      const accountNumber = (document.getElementById("account_number")?.value || "").trim();

      if (!amount || amount <= 0) {
        throw new Error("Enter a valid withdrawal amount");
      }

      if (!bank || !accountName || !accountNumber) {
        throw new Error("Fill all withdrawal fields");
      }

      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: userId,
          amount,
          bank_name: bank,
          account_name: accountName,
          account_number: accountNumber
        })
      });

      const text = await res.text();
      let data = null;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned ${res.status}: ${text.slice(0, 160)}`);
      }

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Withdrawal request failed");
      }

      showMsg("Withdrawal submitted successfully", "success");

      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      console.error("Withdrawal error:", err);
      showMsg(err.message || "Withdrawal failed");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("withdrawForm")?.addEventListener("submit", withdraw);
  });
})();
