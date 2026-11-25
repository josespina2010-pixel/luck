import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { users, type UserRole } from './schema.ts';

const INITIAL_ADMIN_EMAIL = 'lucas0gaona12345@gmail.com';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName = ''
) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const isInitialAdmin = normalizedEmail === INITIAL_ADMIN_EMAIL;

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);

    if (existing.length > 0) {
      const current = existing[0];
      const nextRole: UserRole = isInitialAdmin ? 'admin' : current.role;
      const [updated] = await db
        .update(users)
        .set({
          email: normalizedEmail,
          displayName: displayName || current.displayName,
          role: nextRole,
          updatedAt: new Date(),
        })
        .where(eq(users.uid, uid))
        .returning();
      return updated;
    }

    const initialRole: UserRole = isInitialAdmin ? 'admin' : 'consulta';
    const [inserted] = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        displayName,
        role: initialRole,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          displayName,
          updatedAt: new Date(),
        },
      })
      .returning();

    return inserted;
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('No se pudo sincronizar el usuario en la base de datos.', {
      cause: error,
    });
  }
}

export async function listUsers() {
  try {
    return await db.select().from(users);
  } catch (error) {
    console.error('Database listUsers failed:', error);
    throw new Error('Error al consultar la lista de usuarios.', { cause: error });
  }
}

export async function updateUserRole(userId: number, role: UserRole) {
  try {
    const [updated] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated ?? null;
  } catch (error) {
    console.error('Database updateUserRole failed:', error);
    throw new Error('Error al actualizar el rol del usuario.', { cause: error });
  }
}
