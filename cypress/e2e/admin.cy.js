describe('Módulo de administrador', () => {
  it('Restricción de acceso a usuarios no administradores', () => {
    // Iniciar sesión como técnico (no administrador)
    cy.visit('http://127.0.0.1:5173/dashboard.html');
    cy.get('[name="email"]').type('api2.test.technician.ba375b68@example.com');
    cy.get('[name="password"]').type('6R_lH1woiAq5FFQSJ8bZ8sPd9BSooXDF');
    cy.get('#login-btn').click();

    // En el dashboard no debe mostrarse la tarjeta de administración de usuarios
    cy.get('#dashboard-grid').should('be.visible');
    cy.get('#admin-users-card').should('not.be.visible');

    // Al intentar entrar directamente a usuarios.html debe mostrarse el aviso de restricción
    cy.visit('http://127.0.0.1:5173/src/pages/gestion/usuarios.html');
    cy.get('.not-allowed-card').should('be.visible');
    cy.get('#not-allowed-text').should('have.text', 'Solo el administrador puede administrar usuarios.');
    cy.get('.user-table-card').should('not.be.visible');
    cy.get('.btn-add-user').should('not.be.visible');
  });

  describe('Acciones como administrador', () => {
    beforeEach(() => {
      cy.visit('http://127.0.0.1:5173/dashboard.html');
      cy.get('[name="email"]').type('api2.test.admin.ba375b68@example.com');
      cy.get('[name="password"]').type('NCbQlK93SZgWGiOgmEidxezvgCBtV7Ux');
      cy.get('#login-btn').click();
      cy.get('#admin-users-card').should('be.visible');
    });

    it('Carga correcta del panel principal de administrador', () => {
      // Verificar etiqueta de rol y tarjetas visibles en el panel principal
      cy.get('#dashboard-role-label').should('contain', 'Administrador');
      cy.get('#tickets-card').should('be.visible');
      cy.get('#admin-users-card').should('be.visible');
      cy.get('#reports-card').should('be.visible');

      // Entrar a Administración de usuarios y verificar carga de la vista
      cy.get('#admin-users-card').click();
      cy.url().should('include', '/src/pages/gestion/usuarios.html');
      cy.get('.header-title').should('have.text', 'Administración de usuarios');
      cy.get('.btn-add-user').should('be.visible').and('be.enabled');
      cy.get('#users-body tr[data-id]').should('have.length.greaterThan', 0);
      cy.get('.user-detail-card').should('be.visible');
      cy.get('.not-allowed-card').should('not.be.visible');
    });

    it('Validación de campos vacíos o inválidos al crear usuario', () => {
      cy.get('#admin-users-card').click();
      cy.get('.btn-add-user').should('be.enabled').click();
      cy.get('#user-dialog-title').should('have.text', 'Nuevo usuario');

      // Intentar guardar con campos obligatorios vacíos
      cy.get('#save-user').click();
      cy.get('#user-form input[name="nombre"]:invalid').should('exist');
      cy.get('#user-fields').should('be.visible');

      // Intentar guardar con un correo con formato inválido
      cy.get('#user-form input[name="nombre"]').type('Carlos');
      cy.get('#user-form input[name="apellido"]').type('Pérez');
      cy.get('#user-form input[name="email"]').type('correo-invalido');
      cy.get('#save-user').click();
      cy.get('#user-form input[name="email"]:invalid').should('exist');
      cy.get('#user-fields').should('be.visible');

      // Seleccionar rol Líder de Laboratorio sin asignar laboratorio
      cy.get('#user-form input[name="email"]').clear().type('carlos.perez@example.com');
      cy.get('#user-form select[name="rol"]').select('lider');
      cy.get('#lab-hint')
        .should('be.visible')
        .and('have.text', 'Un líder de laboratorio necesita un laboratorio asignado.');
      cy.get('#save-user').click();
      cy.get('#user-form select[name="laboratorio"]:invalid').should('exist');
      cy.get('#user-fields').should('be.visible');
    });

    it('Registro de correo duplicado', () => {
      cy.get('#admin-users-card').click();
      cy.get('.btn-add-user').should('be.enabled').click();
      cy.get('#user-dialog-title').should('have.text', 'Nuevo usuario');

      // Intentar registrar un correo ya existente
      cy.get('#user-form input[name="nombre"]').type('Usuario');
      cy.get('#user-form input[name="apellido"]').type('Duplicado');
      cy.get('#user-form input[name="email"]').type('api2.test.admin.ba375b68@example.com');
      cy.get('#user-form select[name="rol"]').select('3');
      cy.get('#save-user').click();

      // Verificar mensaje de error del servidor y que no se creó el usuario
      cy.get('#user-dialog-message')
        .should('be.visible')
        .and('have.text', 'El correo ya está registrado');
      cy.get('#user-fields').should('be.visible');
      cy.get('#temp-password').should('not.be.visible');
    });

    it('Edición exitosa de usuario y cambio de rol', () => {
      const correoObjetivo = 'api2.test.teacher.ba375b68@example.com';

      cy.get('#admin-users-card').click();
      cy.get('.btn-add-user').should('be.enabled');

      // Buscar al usuario docente de prueba y verificar su rol inicial
      cy.get('.search-input').clear().type(correoObjetivo);
      cy.get('#users-body tr[data-id]').should('have.length', 1);
      cy.get('#users-body .td-correo').should('have.text', correoObjetivo);
      cy.get('#users-body .badge-role').should('have.text', 'Docente');
      cy.get('.detail-status-badges .badge-role').should('have.text', 'Docente');

      // Editar el usuario para cambiar su rol de Docente a Técnico de soporte
      cy.contains('.detail-actions-row button', 'Editar usuario').click();
      cy.get('#user-dialog-title').should('have.text', 'Editar usuario');
      cy.get('#user-form input[name="email"]').should('be.disabled');
      cy.get('#user-form select[name="rol"]').select('2');
      cy.get('#save-user').click();

      // Confirmar guardado y verificar actualización del rol en tabla y detalle
      cy.get('#user-dialog-message')
        .should('be.visible')
        .and('have.text', 'Cambios guardados.');
      cy.get('#cancel-user-dialog').should('be.enabled').and('have.text', 'Cerrar').click();
      cy.get('#users-body .badge-role').should('have.text', 'Soporte');
      cy.get('.detail-status-badges .badge-role').should('have.text', 'Soporte');

      // Restaurar el rol original a Docente para dejar los datos de prueba intactos
      cy.contains('.detail-actions-row button', 'Editar usuario').click();
      cy.get('#user-form select[name="rol"]').select('3');
      cy.get('#save-user').click();
      cy.get('#user-dialog-message')
        .should('be.visible')
        .and('have.text', 'Cambios guardados.');
      cy.get('#cancel-user-dialog').should('be.enabled').and('have.text', 'Cerrar').click();
      cy.get('#users-body .badge-role').should('have.text', 'Docente');
      cy.get('.detail-status-badges .badge-role').should('have.text', 'Docente');
    });
  });
});
