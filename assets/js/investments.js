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

  async function buyPlan(planId) {
    try {
      if (!window.LomaAuth) {
        throw new Error("LomaAuth not loaded");
      }

      const session = await window.LomaAuth.requireAuth();
      if (!session) return;

      const userId = session.user.id;

      const confirmBuy = confirm("Proceed with this investment?");
      if (!confirmBuy) return;

      const res = await fetch("/api/investment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          user_id: userId,
          plan_id: planId
        })
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned ${res.status} and not valid JSON`);
      }

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Investment failed");
      }

      showMsg("Investment successful", "success");

      setTimeout(() => {
        window.location.href = "investments.html";
      }, 1000);
    } catch (err) {
      console.error("Investment error:", err);
      showMsg(err.message || "Investment failed");
    }
  }

  window.buyPlan = buyPlan;
})();
