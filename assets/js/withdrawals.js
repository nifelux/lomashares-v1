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

  async function loadBanks() {
    try {
      const select = document.getElementById("bank");
      if (!select) return;

      const res = await fetch("/api/banks");
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to load banks");
      }

      select.innerHTML = `
        <option value="">Select Bank</option>
        ${data.banks.map(bank => `
          <option value="${bank.code}" data-name="${bank.name}">
            ${bank.name}
          </option>
        `).join("")}
      `;
    } catch (err) {
      console.error("Load banks error:", err);
      const select = document.getElementById("bank");
      if (select) {
        select.innerHTML = `<option value="">Failed to load banks</option>`;
      }
      showMsg(err.message || "Failed to load banks");
    }
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
      const bankSelect = document.getElementById("bank");
      const bankCode = bankSelect?.value || "";
      const bankName = bankSelect?.options[bankSelect.selectedIndex]?.dataset?.name || "";
      const accountName = (document.getElementById("account_name")?.value || "").trim();
      const accountNumber = (document.getElementById("account_number")?.value || "").trim();

      if (!amount || amount <= 0) {
        throw new Error("Enter a valid withdrawal amount");
      }

      if (!bankCode || !bankName || !accountName || !accountNumber) {
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
          bank_name: bankName,
          bank_code: bankCode,
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
    loadBanks();
    document.getElementById("withdrawForm")?.addEventListener("submit", withdraw);
  });
})();
