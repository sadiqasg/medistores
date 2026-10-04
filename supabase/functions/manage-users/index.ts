import { createClient } from "npm:@supabase/supabase-js@2.50.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError(401, "Missing authorization header");
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerData.user) {
      return jsonError(401, "Unauthorized");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerData.user.id);

    const isAdmin = (callerRoles ?? []).some((r) => r.role === "admin");

    const body = await req.json();
    const action = body.action;

    // Self-service password change — any authenticated user can change their own password
    if (action === "change_password") {
      const { current_password, new_password } = body;
      if (!current_password || !new_password) {
        return jsonError(400, "current_password and new_password are required");
      }
      if (new_password.length < 6) {
        return jsonError(400, "New password must be at least 6 characters");
      }

      const { error: verifyErr } = await callerClient.auth.signInWithPassword({
        email: callerData.user.email!,
        password: current_password,
      });
      if (verifyErr) {
        return jsonError(400, "Current password is incorrect");
      }

      const { error: updateErr } = await adminClient.auth.admin.updateUserById(
        callerData.user.id,
        { password: new_password },
      );
      if (updateErr) {
        return jsonError(500, updateErr.message);
      }

      return jsonResponse(200, { changed: true });
    }

    // All remaining actions require admin
    if (!isAdmin) {
      return jsonError(403, "Only admins can manage users");
    }

    if (action === "admin_reset_password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) {
        return jsonError(400, "user_id and new_password are required");
      }
      if (new_password.length < 6) {
        return jsonError(400, "New password must be at least 6 characters");
      }
      if (user_id === callerData.user.id) {
        return jsonError(400, "Use the password change option for your own account");
      }

      const { error: updateErr } = await adminClient.auth.admin.updateUserById(
        user_id,
        { password: new_password },
      );
      if (updateErr) {
        return jsonError(500, updateErr.message);
      }

      return jsonResponse(200, { reset: true, user_id });
    }

    if (action === "create") {
      const { email, password, full_name, role } = body;
      if (!email || !password || !role) {
        return jsonError(400, "email, password, and role are required");
      }
      if (!["admin", "staff", "family_viewer"].includes(role)) {
        return jsonError(400, "Invalid role");
      }

      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || email },
      });

      if (createErr) {
        return jsonError(400, createErr.message);
      }

      const userId = newUser.user.id;

      const { error: profileErr } = await adminClient
        .from("profiles")
        .insert({ id: userId, full_name: full_name || null, email });

      if (profileErr) {
        // non-fatal — profile may already exist via trigger
      }

      const { error: roleErr } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role });

      if (roleErr) {
        return jsonError(500, `User created but role assignment failed: ${roleErr.message}`);
      }

      return jsonResponse(201, { id: userId, email, role, full_name });
    }

    if (action === "update_role") {
      const { user_id, role } = body;
      if (!user_id || !role) {
        return jsonError(400, "user_id and role are required");
      }
      if (!["admin", "staff", "family_viewer"].includes(role)) {
        return jsonError(400, "Invalid role");
      }
      if (user_id === callerData.user.id) {
        return jsonError(400, "You cannot change your own role");
      }

      const { error: delErr } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", user_id);

      if (delErr) {
        return jsonError(500, delErr.message);
      }

      const { error: insErr } = await adminClient
        .from("user_roles")
        .insert({ user_id, role });

      if (insErr) {
        return jsonError(500, insErr.message);
      }

      return jsonResponse(200, { user_id, role });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) {
        return jsonError(400, "user_id is required");
      }
      if (user_id === callerData.user.id) {
        return jsonError(400, "You cannot delete your own account");
      }

      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("profiles").delete().eq("id", user_id);

      const { error: delErr } = await adminClient.auth.admin.deleteUser(user_id);
      if (delErr) {
        return jsonError(500, delErr.message);
      }

      return jsonResponse(200, { deleted: true, user_id });
    }

    if (action === "list") {
      const { data: users } = await adminClient.auth.admin.listUsers();
      const { data: profiles } = await adminClient.from("profiles").select("*");
      const { data: roles } = await adminClient.from("user_roles").select("*");

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      const roleMap = new Map();
      for (const r of roles ?? []) {
        roleMap.set(r.user_id, r.role);
      }

      const result = (users.users ?? []).map((u) => ({
        id: u.id,
        email: u.email,
        full_name: profileMap.get(u.id)?.full_name ?? u.user_metadata?.full_name ?? "",
        role: roleMap.get(u.id) ?? "family_viewer",
        created_at: u.created_at,
      }));

      return jsonResponse(200, { users: result });
    }

    return jsonError(400, "Unknown action");
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Internal error");
  }
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, message: string) {
  return jsonResponse(status, { error: message });
}
