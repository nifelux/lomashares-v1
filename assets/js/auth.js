(function () {
  "use strict";

  function startAuth() {
    if (!window.sb) {
      console.error("Supabase client not initialized. Load supabase.js first.");
      return;
    }

    const sb = window.sb;

    function $(id) {
      return document.getElementById(id);
    }

    function getMeta(name) {
      return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || "";
    }

    function getPageMode() {
      return document.body?.getAttribute("data-page") || "";
    }

    function getRequiredRole() {
      return document.body?.getAttribute("data-role") || "user";
    }

    function showMessage(message, type = "info") {
      const box = $("msg");
      if (!box) return;
      box.textContent = message;
      box.className = `msg ${type}`;
      box.style.display = "block";
    }

    function clearMessage() {
      const box = $("msg");
      if (!box) return;
      box.textContent = "";
      box.className = "msg";
      box.style.display = "none";
    }

    function setLoading(button, loadingText = "Please wait...") {
      if (!button) return;
      button.dataset.originalText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = loadingText;
    }

    function unsetLoading(button) {
      if (!button) return;
      button.disabled = false;
      if (button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
      }
    }

    async function getSession() {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      return data.session || null;
    }

    async function getCurrentUser() {
      const { data, error } = await sb.auth.getUser();
      if (error) throw error;
      return data.user || null;
    }

    async function getProfile(userId) {
      const { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;
      return data;
    }

    async function updateProfileAfterSignup(userId, payload) {
      const { error } = await sb
        .from("profiles")
        .update(payload)
        .eq("id", userId);

      if (error) throw error;
    }

    function normalizeEmail(value) {
      return String(value || "").trim().toLowerCase();
    }

    function normalizeText(value) {
      return String(value || "").trim();
    }

    async function loginWithPassword(email, password) {
      return sb.auth.signInWithPassword({
        email: normalizeEmail(email),
        password
      });
    }

    async function registerWithPassword(formData) {
      const email = normalizeEmail(formData.email);
      const password = formData.password;
      const fullName = normalizeText(formData.full_name);
      const phone = normalizeText(formData.phone);
      const state = normalizeText(formData.state);
      const lga = normalizeText(formData.lga);
      const referralCode = normalizeText(formData.referral_code).toUpperCase();

      let referredBy = null;

      if (referralCode) {
        const { data: refRows, error: refError } = await sb.rpc("get_referrer_by_code", {
          p_code: referralCode
        });

        const refProfile = Array.isArray(refRows) ? refRows[0] : null;

        if (refError || !refProfile) {
          throw new Error("Invalid referral code.");
        }

        referredBy = refProfile.id;
      }

      const { data, error } = await sb.auth.signUp({
        email,
        password
      });

      if (error) throw error;

      const user = data.user;
      if (!user) {
        throw new Error("Signup failed. User record was not created.");
      }

      await updateProfileAfterSignup(user.id, {
        full_name: fullName || null,
        email,
        phone: phone || null,
        state: state || null,
        lga: lga || null,
        referred_by: referredBy
      });

      return data;
    }

    async function logout() {
      const { error } = await sb.auth.signOut();
      if (error) throw error;
      window.location.href = "/login.html";
    }

    async function requireAuth() {
      const session = await getSession();
      if (!session) {
        window.location.href = "/login.html";
        return null;
      }
      return session;
    }

    async function requireGuest() {
      const session = await getSession();
      if (session) {
        window.location.href = "/dashboard.html";
        return false;
      }
      return true;
    }

    async function requireRole(requiredRole = "user") {
      const session = await requireAuth();
      if (!session) return null;

      const profile = await getProfile(session.user.id);

      if (requiredRole === "admin") {
        if (!["admin", "super_admin"].includes(profile.role)) {
          window.location.href = "/dashboard.html";
          return null;
        }
      }

      return { session, profile };
    }

    async function fillAuthUserUI() {
      try {
        const session = await getSession();
        if (!session?.user) return;

        const profile = await getProfile(session.user.id);

        document.querySelectorAll("[data-auth='full_name']").forEach((el) => {
          el.textContent = profile.full_name || "User";
        });

        document.querySelectorAll("[data-auth='email']").forEach((el) => {
          el.textContent = profile.email || session.user.email || "";
        });

        document.querySelectorAll("[data-auth='referral_code']").forEach((el) => {
          el.textContent = profile.referral_code || "";
        });

        document.querySelectorAll("[data-auth='role']").forEach((el) => {
          el.textContent = profile.role || "user";
        });
      } catch (err) {
        console.error("Failed to fill auth UI:", err);
      }
    }

    function bindLogoutButtons() {
      document.querySelectorAll("[data-action='logout']").forEach((btn) => {
        btn.addEventListener("click", async function (e) {
          e.preventDefault();
          try {
            await logout();
          } catch (err) {
            showMessage(err.message || "Logout failed.", "error");
          }
        });
      });
    }

    function handleLoginForm() {
      const form = $("loginForm");
      if (!form) return;

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearMessage();

        const submitBtn = form.querySelector("button[type='submit']");
        setLoading(submitBtn, "Logging in...");

        try {
          const email = normalizeEmail($("email")?.value);
          const password = $("password")?.value || "";

          if (!email || !password) {
            throw new Error("Enter your email and password.");
          }

          const { error } = await loginWithPassword(email, password);
          if (error) throw error;

          window.location.href = "/dashboard.html";
        } catch (err) {
          showMessage(err.message || "Login failed.", "error");
        } finally {
          unsetLoading(submitBtn);
        }
      });
    }

    function handleRegisterForm() {
      const form = $("registerForm");
      if (!form) return;

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearMessage();

        const submitBtn = form.querySelector("button[type='submit']");
        setLoading(submitBtn, "Creating account...");

        try {
          const full_name = $("full_name")?.value || "";
          const email = $("email")?.value || "";
          const phone = $("phone")?.value || "";
          const state = $("state")?.value || "";
          const lga = $("lga")?.value || "";
          const referral_code = $("referral_code")?.value || "";
          const password = $("password")?.value || "";
          const confirm_password = $("confirm_password")?.value || "";

          if (!full_name || !email || !phone || !password || !confirm_password) {
            throw new Error("Please fill all required fields.");
          }

          if (password.length < 6) {
            throw new Error("Password must be at least 6 characters.");
          }

          if (password !== confirm_password) {
            throw new Error("Passwords do not match.");
          }

          await registerWithPassword({
            full_name,
            email,
            phone,
            state,
            lga,
            referral_code,
            password
          });

          showMessage("Account created successfully. You can now log in.", "success");

          setTimeout(() => {
            window.location.href = "/login.html";
          }, 1200);
        } catch (err) {
          showMessage(err.message || "Registration failed.", "error");
        } finally {
          unsetLoading(submitBtn);
        }
      });
    }

    async function protectCurrentPage() {
      const mode = getPageMode();
      const requiredRole = getRequiredRole();

      try {
        if (mode === "guest") {
          await requireGuest();
          return;
        }

        if (mode === "user") {
          await requireAuth();
          await fillAuthUserUI();
          return;
        }

        if (mode === "admin") {
          await requireRole(requiredRole);
          await fillAuthUserUI();
        }
      } catch (err) {
        console.error("Page protection error:", err);
        window.location.href = "/login.html";
      }
    }

    async function init() {
      bindLogoutButtons();
      await protectCurrentPage();
      handleLoginForm();
      handleRegisterForm();

      sb.auth.onAuthStateChange(async (event) => {
        if (event === "SIGNED_OUT") {
          const mode = getPageMode();
          if (mode === "user" || mode === "admin") {
            window.location.href = "/login.html";
          }
        }
      });
    }

    window.LomaAuth = {
      getSession,
      getCurrentUser,
      getProfile,
      requireAuth,
      requireRole,
      logout
    };

    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAuth);
  } else {
    startAuth();
  }
})();
