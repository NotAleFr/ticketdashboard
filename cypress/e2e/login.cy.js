beforeEach(() => {
    cy.visit('http://127.0.0.1:5173/dashboard.html')
  })

it('Flujo de inicio de sesion (por roles)', () => {
    // Llenar el formulario como Administrador
    cy.get('[name="email"]').click();
    cy.get('[name="email"]').type('api2.test.admin.ba375b68@example.com');
    cy.get('[name="password"]').click();
    cy.get('[name="password"]').type('NCbQlK93SZgWGiOgmEidxezvgCBtV7Ux');
    cy.get('#login-btn').click();

    cy.get('#settings-button svg').click();
    cy.get('#logout-button').click();
    cy.get('#confirm-logout-button').click()
    cy.get('#login-btn').should('be.visible');

    // Llenar el formulario como Tecnico Lider
    cy.get('[name="email"]').click();
    cy.get('[name="email"]').type('api2.test.leader.ba375b68@example.com');
    cy.get('[name="password"]').click();
    cy.get('[name="password"]').type('eZOnpVrFqNCAIkgRSQX28NoU0KEPwcPz');
    cy.get('#login-btn').click();

    cy.get('#settings-button svg').click();
    cy.get('#logout-button').click();
    cy.get('#confirm-logout-button').click();
    cy.get('#login-btn').should('be.visible');

    // Llenar el formulario como Tecnico no Lider
    cy.get('[name="email"]').click();
    cy.get('[name="email"]').type('api2.test.technician.ba375b68@example.com');
    cy.get('[name="password"]').click();
    cy.get('[name="password"]').type('6R_lH1woiAq5FFQSJ8bZ8sPd9BSooXDF');
    cy.get('#login-btn').click();

    cy.get('#settings-button svg').click();
    cy.get('#logout-button').click();
    cy.get('#confirm-logout-button').click();
    cy.get('#login-btn').should('be.visible');

    // Llenar el formulario como Docente
    cy.get('[name="email"]').click();
    cy.get('[name="email"]').type('api2.test.teacher.ba375b68@example.com');
    cy.get('[name="password"]').click();
    cy.get('[name="password"]').type('PNgeFQqT89HG4TELlB65L2hmpXlnigME');
    cy.get('#login-btn').click();
    
    cy.get('#settings-button svg').click();
    cy.get('#logout-button').click();
    cy.get('#confirm-logout-button').click();
    cy.get('#login-btn').should('be.visible');
})

it('Validacion de formulario', () => {
    // Formulario vacio
    cy.get('#login-btn').click();
    cy.get('#login-btn').should('be.visible');
    cy.get('#settings-button').should('not.exist');

    // Correo incorrecto
    cy.get('[name="email"]').clear().type('correo.falso@example.com');
    cy.get('[name="password"]').clear().type('NCbQlK93SZgWGiOgmEidxezvgCBtV7Ux');
    cy.get('#login-btn').click();
    cy.get('#login-btn').should('be.visible');
    cy.get('#settings-button').should('not.exist');

    // Contraseña incorrecta
    cy.get('[name="email"]').clear().type('api2.test.admin.ba375b68@example.com');
    cy.get('[name="password"]').clear().type('contraseña_incorrecta');
    cy.get('#login-btn').click();
    cy.get('#login-btn').should('be.visible');
    cy.get('#settings-button').should('not.exist');
  })

it('Control de rutas', () => {
    // Acceder a rutas sin iniciar sesion
    cy.visit('http://127.0.0.1:5173/src/pages/gestion/gestion.html');
    cy.get('#login-btn').should('be.visible');

    cy.visit('http://127.0.0.1:5173/src/pages/gestion/reportes.html');
    cy.get('#login-btn').should('be.visible');

    cy.visit('http://127.0.0.1:5173/src/pages/gestion/usuarios.html');
    cy.get('#login-btn').should('be.visible');

    // Acceder a rutas despues de cerrar sesion
    cy.visit('http://127.0.0.1:5173/dashboard.html');
    cy.get('[name="email"]').type('api2.test.admin.ba375b68@example.com');
    cy.get('[name="password"]').type('NCbQlK93SZgWGiOgmEidxezvgCBtV7Ux');
    cy.get('#login-btn').click();
    cy.get('#settings-button').should('be.visible');

    cy.get('#settings-button svg').click();
    cy.get('#logout-button').click();
    cy.get('#confirm-logout-button').click();
    cy.get('#login-btn').should('be.visible');

    cy.visit('http://127.0.0.1:5173/src/pages/gestion/usuarios.html');
    cy.get('#login-btn').should('be.visible');
  })

it('Flujo de recuperacion de contraseña', () => {
    cy.get('#login-form a.auth__link').click();
    cy.get('[name="email"]').click();
    cy.get('[name="email"]').type('api2.test.teacher.ba375b68@example.com');
    cy.get('#recovery-btn').click();
    cy.get('a.auth__link').click();
})

