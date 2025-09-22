# Supabase setup

The app can use Supabase as its backing store instead of browser `localStorage`.
Follow these steps to prepare a project:

1. Create a new project in [Supabase](https://supabase.com/) and wait for the
   database to provision.
2. Open the SQL Editor and run [`schema.sql`](./schema.sql). The script creates
   the tables (`customers`, `projects`, `work_orders`, `purchase_orders`),
   per-account ownership columns, indexes, and Row Level Security policies that
   scope every query to the signed-in user.
3. In the Supabase dashboard copy the Project URL and the `anon` public API key.
4. Create email/password users in the Supabase Auth dashboard. Each user gets a
   private set of customers/projects/work orders in the app.
5. Copy `.env.example` to `.env.local` in the project root (or otherwise
   provide the variables) with:

   ```bash
   VITE_SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
   VITE_SUPABASE_ANON_KEY="YOUR_ANON_KEY"
   ```

6. Restart `npm run dev` (or rebuild for production). When the variables are
   present the UI will show "Storage: Supabase" and require sign-in before
   loading data from the remote database.

## Roles and user management

The SQL script now provisions a `user_roles` table, a `me_roles` view, and a
`grant_role_by_email` helper so the front-end can enable role-aware experiences.

To expose the admin APIs, deploy the bundled Supabase Edge Function:

```bash
supabase functions deploy user-management --project-ref YOUR_PROJECT_REF
```

The function must run with the `service_role` key (Supabase automatically
injects this at runtime) and enforces that only users with the `admin` role can
list accounts or grant/revoke roles. The UI invokes the function via
`supabase.functions.invoke('user-management', …)`.

Assign roles to users (e.g. `viewer`, `editor`, `admin`) from the "Manage Users"
screen or by calling `select grant_role_by_email('user@example.com', 'editor',
true);` in the SQL editor. Viewers get read-only access, editors/admins can
mutate data, and admin accounts can manage other users.

The script is idempotent so you can re-run it to refresh the policies. To remove
all data simply truncate the tables in Supabase or use the dashboard to delete
rows.
