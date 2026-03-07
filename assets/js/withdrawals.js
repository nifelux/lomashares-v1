(function () {

"use strict";

async function withdraw(e) {

e.preventDefault();

const session = await LomaAuth.requireAuth();
const userId = session.user.id;

const amount = Number(document.getElementById("amount").value);
const bank = document.getElementById("bank").value;
const accountName = document.getElementById("account_name").value;
const accountNumber = document.getElementById("account_number").value;

const res = await fetch("/api/withdraw", {

method: "POST",

headers: {
"Content-Type": "application/json"
},

body: JSON.stringify({

user_id: userId,
amount: amount,
bank_name: bank,
account_name: accountName,
account_number: accountNumber

})

});

const data = await res.json();

if (!data.ok) {

alert(data.error);
return;

}

alert("Withdrawal submitted successfully");

location.reload();

}

document.getElementById("withdrawForm")?.addEventListener("submit", withdraw);

})();
