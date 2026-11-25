import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/users.ts';
import type { UserRole } from '../db/schema.ts';

export interface AuthenticatedDbUser {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: AuthenticatedDbUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      accepted: false,
      code: 'UNAUTHORIZED',
      rule: 'Autenticación requerida',
      message: 'Debe iniciar sesión con una cuenta autorizada para acceder al sistema.',
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({
      accepted: false,
      code: 'UNAUTHORIZED',
      rule: 'Autenticación requerida',
      message: 'Token de sesión ausente.',
    });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    const dbUser = await getOrCreateUser(
      decoded.uid,
      decoded.email || `${decoded.uid}@usuario.local`,
      decoded.name || ''
    );
    req.dbUser = dbUser;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({
      accepted: false,
      code: 'INVALID_TOKEN',
      rule: 'Verificación de identidad',
      message: 'La sesión expiró o el token no es válido. Vuelva a iniciar sesión.',
    });
  }
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.dbUser || req.dbUser.role !== 'admin') {
    return res.status(403).json({
      accepted: false,
      code: 'FORBIDDEN_ROLE',
      rule: 'Control de acceso por rol (Administrador vs Consulta)',
      message:
        'Operación rechazada: su perfil es de Usuario de consulta y solo tiene autorización para revisar información permitida en modo lectura.',
    });
  }
  next();
};
