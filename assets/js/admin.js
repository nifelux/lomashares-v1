(function () {

"use strict";

async function adminAction(action, payload = {}) {

const session = await LomaAuth.requireAuth();
const adminId = session.user.id;

const res = await fetch("/api/admin", {

method: "POST",

headers: {
"Content-Type": "application/json"
},

body: JSON.stringify({

action: action,
admin_user_id: adminId,
...payload

})

});

const data = await res.json();

if (!data.ok) {

alert(data.error);
return;

}

return data;

}

window.Admin = {

approveWithdrawal: async function (id) {

await adminAction("approve_withdrawal", {
withdrawal_id: id
});

alert("Withdrawal approved");
location.reload();

},

rejectWithdrawal: async function (id) {

const reason = prompt("Reason for rejection");

await adminAction("reject_withdrawal", {

withdrawal_id: id,
reason: reason

});

alert("Withdrawal rejected");
location.reload();

},

generateGift: async function (code, amount) {

await adminAction("generate_gift_code", {

code: code,
amount: amount

});

alert("Gift code created");
location.reload();

}

};

})();
