describe('example to-do app', () => {
  beforeEach(() => {
    cy.visit('http://127.0.0.1:5173/dashboard.html')
    cy.get('[name="email"]').click();
    cy.get('[name="email"]').type('api2.test.teacher.ba375b68@example.com');
    cy.get('[name="password"]').click();
    cy.get('[name="password"]').type('PNgeFQqT89HG4TELlB65L2hmpXlnigME');
    cy.get('#login-btn').click();
    cy.wait(2000);
  })

  it('Usuarios no accesible', () => {
    cy.visit('http://127.0.0.1:5173/src/pages/gestion/usuarios.html');
    cy.get('#not-allowed-text').should('have.text', "Solo el administrador puede administrar usuarios.");
  })

  it('CrearTicket normal', () => {
    cy.get('#tickets-card img').click();
    cy.get('[name="nombre_ticket"]').click();
    cy.get('[name="nombre_ticket"]').type('Pantalla Rota');
    cy.get('[name="id_aula"]').select('1');
    cy.get('#problem-types-list label:nth-child(1) span').click();
    cy.get('#problem-types-list input[value="1"]').check();
    cy.get('[name="descripcion"]').click();
    cy.get('[name="descripcion"]').type('Pantalla rota por un alumno');
    cy.get('#submit-ticket').click();
    cy.get('#form-message').should('have.text', "Ticket creado. Volviendo a la lista...");

  })
    it('CrearTicket Nombre Nulo', () => {
    cy.get('#tickets-card').click();
    cy.get('[name="nombre_ticket"]').click();
    cy.get('[name="id_aula"]').select('1');
    cy.get('#problem-types-list label:nth-child(3) span').click();
    cy.get('#problem-types-list input[value="5"]').check();
    cy.get('[name="descripcion"]').click();
    cy.get('[name="descripcion"]').type('error');
    cy.get('#submit-ticket').click();
    cy.get('#ticket-title-error').should('have.text', 'Escribe un nombre para el ticket.');
  })


  it('CrearTicket Ubicacion Nula', () => {
    cy.get('#tickets-card').click();
   cy.get('[name="nombre_ticket"]').click();
    cy.get('[name="nombre_ticket"]').type('Error de computadora');
    cy.get('[name="descripcion"]').click();
    cy.get('[name="descripcion"]').type('Error de pantalla negra');
    cy.get('#problem-types-list input[value="1"]').check();
    cy.get('#submit-ticket').click();
    cy.get('#classroom-select-error').should('have.text', 'Selecciona el aula donde está el problema.');
  })

  it('CrearTicket Tipo de problema no especificado', () => {
    cy.get('#tickets-card').click();
    cy.get('[name="nombre_ticket"]').click();
    cy.get('[name="nombre_ticket"]').type('No se encuentra vscode');
    cy.get('[name="id_aula"]').select('1');
    cy.get('[name="descripcion"]').click();
    cy.get('[name="descripcion"]').type('La sala dice tener vscode');
    cy.get('#submit-ticket').click();
    cy.get('#problem-types-error').should('have.text', 'Selecciona al menos un tipo de problema.');
  })
  it('CrearTicket Descripcion Nula', () => {
    cy.get('#tickets-card').click();
    cy.get('[name="nombre_ticket"]').click();
    cy.get('[name="nombre_ticket"]').type('Error de red en el salon');
    cy.get('[name="id_aula"]').select('2');
    cy.get('#problem-types-list label:nth-child(6) span').click();
    cy.get('#problem-types-list input[value="6"]').check();
    cy.get('#submit-ticket').click();
    cy.get('#ticket-description-error').should('have.text', 'Describe qué ocurre.');
  })
})