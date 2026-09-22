import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: "http://localhost:8085",
  realm: "identity-os",
  clientId: "identity-os-frontend",
});

export async function logoutFromKeycloak() {
  const redirectUri = process.env.NEXT_PUBLIC_PORTAL_WELCOME_URL || "http://localhost:9091/";
  try {
    localStorage.removeItem("identity_os_hosted_admin_token");
    localStorage.removeItem("identity_os_hosted_admin_client_id");
  } catch {
    // Ignore storage cleanup failures during logout.
  }
  if (!keycloak.authenticated) {
    window.location.href = redirectUri;
    return;
  }
  await keycloak.logout({
    redirectUri,
  });
}

export default keycloak;
