export const ROLE_MODULES = [
  'resumen',
  'flota',
  'personal',
  'dashboard',
  'tickets',
  'entregas',
  'devoluciones',
  'mantenimiento',
  'reportes',
  'usuarios'
];

export const ROLE_PERMISSIONS = {
  admin: {
    ...Object.fromEntries(
      ROLE_MODULES.map(modulo => [
        modulo,
        {
          ver: true,
          editar: true
        }
      ])
    ),

    tickets: {
      ver: true,
      editar: true,
      crear: true,
      gestionar: true
    }
  },

  supervisor: {
    resumen: {
      ver: true,
      editar: false
    },

    flota: {
      ver: true,
      editar: false
    },

    personal: {
      ver: false,
      editar: false
    },

    dashboard: {
      ver: true,
      editar: true
    },

    tickets: {
      ver: true,
      editar: false,
      crear: true,
      gestionar: false
    },

    entregas: {
      ver: true,
      editar: true
    },

    devoluciones: {
      ver: false,
      editar: false
    },

    mantenimiento: {
      ver: false,
      editar: false
    },

    reportes: {
      ver: false,
      editar: false
    },

    usuarios: {
      ver: false,
      editar: false
    }
  },

  ti: {
    resumen: {
      ver: true,
      editar: false
    },

    flota: {
      ver: true,
      editar: true
    },

    personal: {
      ver: true,
      editar: true
    },

    dashboard: {
      ver: true,
      editar: true
    },

    tickets: {
      ver: true,
      editar: true,
      crear: false,
      gestionar: true
    },

    entregas: {
      ver: true,
      editar: true
    },

    devoluciones: {
      ver: true,
      editar: true
    },

    mantenimiento: {
      ver: true,
      editar: true
    },

    reportes: {
      ver: false,
      editar: false
    },

    usuarios: {
      ver: false,
      editar: false
    }
  }
};