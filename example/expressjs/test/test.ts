import { createAuthClient } from "better-auth/client";
import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";

// Create a cookie jar to persist cookies across requests in Node.js
const cookieJar = new CookieJar();

// Create a fetch wrapper that handles cookies
const fetchWithCookies = fetchCookie(fetch, cookieJar);

// Point this to your Express auth server
// The Better Auth client will automatically use the `/api/auth` routes
const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  fetch: fetchWithCookies,
});

async function stepSignUp(email: string, password: string) {
  try {
    console.log("\n[1] Sign Up (email & password)");
    const { data, error } = await authClient.signUp.email({
      name: "Test User",
      email,
      password,
      // image and callbackURL are optional – keeping it minimal here
    });

    if (error) {
      console.error("Sign up error:", error);
    } else {
      console.log("Sign up success. User:", data?.user ?? data);
    }
  } catch (err) {
    console.error("Unexpected sign up error:", err);
  }
}

async function stepSignIn(email: string, password: string) {
  try {
    console.log("\n[2] Sign In (email & password)");
    
    // Use raw fetch to ensure cookies are captured
    const response = await fetchWithCookies("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe: true }),
    });
    
    const data = await response.json();
    if (!response.ok) {
      console.error("Sign in error:", data);
    } else {
      console.log("Sign in success. data:", data);
    }
  } catch (err) {
    console.error("Unexpected sign in error:", err);
  }
}

// Note: This requires a valid session cookie. Cookies are now persisted
// using a cookie jar, so this should work correctly.
async function stepChangePassword(
  currentPassword: string,
  newPassword: string,
) {
  try {
    console.log("\n[3] Change Password");
    
    // Use raw fetch with Origin header (required for CSRF protection in Node.js)
    const response = await fetchWithCookies("http://localhost:3000/api/auth/change-password", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Origin": "http://localhost:3000",
      },
      body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: true }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error("Change password error:", data);
    } else {
      console.log("Change password success:", data);
    }
  } catch (err) {
    console.error("Unexpected change password error:", err);
  }
}

async function stepSignInWithNewPassword(email: string, newPassword: string) {
  try {
    console.log("\n[4] Sign In with new password");
    const { data, error } = await authClient.signIn.email({
      email,
      password: newPassword,
      rememberMe: true,
    });

    if (error) {
      console.error(
        "Sign in with new password error (may fail if password wasn't changed):",
        error,
      );
    } else {
      console.log("Sign in with new password success. data:", data);
    }
  } catch (err) {
    console.error("Unexpected sign in with new password error:", err);
  }
}

async function stepSignOut() {
  try {
    console.log("\n[5] Sign Out");
    const { data, error } = await authClient.signOut({});

    if (error) {
      console.error("Sign out error:", error);
    } else {
      console.log("Sign out success:", data);
    }
  } catch (err) {
    console.error("Unexpected sign out error:", err);
  }
}

async function runEmailPasswordFlows() {
  // Use a fresh, unique email on each run so sign up doesn't clash
  const uniqueSuffix = Date.now();
  const email = `test.user+${uniqueSuffix}@example.com`;
  const password = "password1234";
  const newPassword = "newpassword1234";

  console.log("=== Email & Password Auth Flow Test ===");
  console.log("Base URL:", "http://localhost:3000");
  console.log("Test user email:", email);
  console.log("---------------------------------------");

  // Execute steps sequentially
  await stepSignUp(email, password);
  await stepSignIn(email, password);
  await stepChangePassword(password, newPassword);
  await stepSignInWithNewPassword(email, newPassword);
  await stepSignOut();

  console.log("\n=== Email & Password Auth Flow Test Finished ===");
}

// Run when invoked directly with `tsx test/test.ts` or `node dist/test.js`
runEmailPasswordFlows().catch((err) => {
  console.error("Fatal error while running auth flow tests:", err);
  process.exitCode = 1;
});
