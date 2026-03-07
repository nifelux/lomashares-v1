(function () {

"use strict";

async function redeem() {

const code = document.getElementById("code").value;

if (!code) {
alert("Enter gift code");
return;
}

const session = await LomaAuth.requireAuth();

const res = await fetch("/api/gift", {

method: "POST",

headers: {
"Content-Type": "application/json"
},

body: JSON.stringify({

user_id: session.user.id,
code: code

})

});

const data = await res.json();

if (!data.ok) {

alert(data.error);
return;

}

alert("₦" + data.amount + " credited");

location.reload();

}

window.redeem = redeem;

})();
