(function () {

"use strict";

async function buyPlan(planId) {

const session = await LomaAuth.requireAuth();
const userId = session.user.id;

const confirmBuy = confirm("Proceed with this investment?");

if (!confirmBuy) return;

const res = await fetch("/api/investment", {

method: "POST",

headers: {
"Content-Type": "application/json"
},

body: JSON.stringify({

user_id: userId,
plan_id: planId

})

});

const data = await res.json();

if (!data.ok) {

alert(data.error);
return;

}

alert("Investment successful");

window.location.href = "investments.html";

}

window.buyPlan = buyPlan;

})();
