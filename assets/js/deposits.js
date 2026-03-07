(function () {

"use strict";

async function deposit() {

const amount = Number(document.getElementById("amount").value);

if (!amount || amount < 100) {
alert("Minimum deposit is ₦100");
return;
}

const session = await LomaAuth.requireAuth();
const user = session.user;

const { data: profile } = await sb
.from("profiles")
.select("email")
.eq("id", user.id)
.single();

const res = await fetch("/api/deposit", {

method: "POST",

headers: {
"Content-Type": "application/json"
},

body: JSON.stringify({

user_id: user.id,
email: profile.email,
amount: amount

})

});

const data = await res.json();

if (!data.ok) {
alert(data.error || "Deposit failed");
return;
}

window.location.href = data.authorization_url;

}

document.getElementById("depositBtn")?.addEventListener("click", deposit);

})();
