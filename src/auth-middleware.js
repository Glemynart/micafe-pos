const PERMISSIONS = {
  admin: {
    roles: ['admin'],
    permissions: ['*'],
  },
  operator: {
    roles: ['operator'],
    permissions: [
      'ventas:leer',
      'ventas:crear',
      'productos:leer',
      'dashboard:leer',
      'config:leer',
      'historial:leer',
    ],
  },
};

class AuthMiddleware {
  constructor() {
    this.userSessions = new Map(); // webContentsId -> { id, usuario, rol }
  }

  setUserSession(webContents, user) {
    this.userSessions.set(webContents.id, {
      id: user.id,
      usuario: user.usuario,
      rol: user.rol || 'operator',
    });
  }

  clearUserSession(webContents) {
    this.userSessions.delete(webContents.id);
  }

  getUserFromEvent(event) {
    return this.userSessions.get(event?.sender?.id) || null;
  }

  requireRole(...allowedRoles) {
    return (handler) => {
      return async (event, ...args) => {
        const user = this.getUserFromEvent(event);

        if (!user) {
          return { ok: false, error: 'No autenticado. Inicie sesión nuevamente.' };
        }

        if (!allowedRoles.includes(user.rol) && !allowedRoles.includes('*')) {
          console.warn(`[SEGURIDAD] Acceso denegado: usuario=${user.usuario}, rol=${user.rol}`);
          return { ok: false, error: 'No tiene permisos para esta operación' };
        }

        return handler(event, ...args);
      };
    };
  }

  requirePermission(permiso) {
    return (handler) => {
      return async (event, ...args) => {
        const user = this.getUserFromEvent(event);

        if (!user) {
          return { ok: false, error: 'No autenticado. Inicie sesión nuevamente.' };
        }

        const roleDef = PERMISSIONS[user.rol];
        if (!roleDef) {
          return { ok: false, error: 'Rol no reconocido' };
        }

        const allowed = roleDef.permissions.includes('*') || roleDef.permissions.includes(permiso);

        if (!allowed) {
          console.warn(`[SEGURIDAD] Permiso denegado: usuario=${user.usuario}, permiso=${permiso}`);
          return { ok: false, error: 'Permiso denegado' };
        }

        return handler(event, ...args);
      };
    };
  }
}

module.exports = new AuthMiddleware();
