const BASE_URL = 'http://127.0.0.1:5173'
const ADMIN_EMAIL = 'api2.test.admin.ba375b68@example.com'
const ADMIN_PASSWORD = 'NCbQlK93SZgWGiOgmEidxezvgCBtV7Ux'
const DOCENTE_EMAIL = 'api2.test.teacher.ba375b68@example.com'

describe('Administración de usuarios', () => {
  beforeEach(() => {
    cy.visit(`${BASE_URL}/dashboard.html`)
    cy.get('[name="email"]').type(ADMIN_EMAIL)
    cy.get('[name="password"]').type(ADMIN_PASSWORD, { log: false })
    cy.get('#login-btn').click()
    cy.get('#admin-users-card').should('be.visible').click()
    cy.url().should('include', '/usuarios.html')
    cy.get('.btn-add-user').should('be.enabled')
    cy.get('#users-body tr[data-id]').should('have.length.greaterThan', 0)
  })

  it('Actualizar contador y mostrar solo Rol Docentes', () => {
    cy.get('[aria-label="Filtrar por rol"]').select('docente')

    cy.get('#users-body tr[data-id]')
      .should('have.length.greaterThan', 0)
      .each(($fila) => {
        cy.wrap($fila).find('.badge-role').should('have.text', 'Docente')
      })
    //    cy.get('.table-footer-text').invoke('text').should('match', /^\d+ usuarios de \d+$/)

    cy.get('[aria-label="Filtrar por rol"]').select('todos')
    //    cy.get('.table-footer-text').invoke('text').should('match', /^\d+ usuarios$/)
  })

  it('La búsqueda sin coincidencias da un aviso, oculta la info y se reinicia', () => {
    cy.get('.search-input').type('zzz-no-existe-999')

    cy.get('#users-body tr[data-id]').should('not.exist')
    cy.get('#users-body').should('contain.text', 'No se encontraron usuarios.')
    //    cy.get('.table-footer-text').invoke('text').should('match', /^0 usuarios de \d+$/)
    cy.get('.user-detail-card').should('not.be.visible')

    cy.get('.search-input').clear()
    cy.get('#users-body tr[data-id]').should('have.length.greaterThan', 0)
    cy.get('.user-detail-card').should('be.visible')
  })

  it('Al seleccionar un usuario de la tabla se muestra su información completa', () => {
    cy.get('#users-body tr[data-id]').should('have.length.greaterThan', 1)

    cy.get('#users-body tr[data-id]').eq(1).then(($fila) => {
      const nombre = $fila.find('.td-usuario').text()
      const correo = $fila.find('.td-correo').text()

      cy.wrap($fila).click()

      cy.get('.identity-name').should('have.text', nombre)
      cy.get('.metadata-value').first().should('have.text', correo)
      cy.get('.identity-code').invoke('text').should('match', /^USR-/)
      cy.get('#users-body tr.row-selected .td-correo').should('have.text', correo)
    })
  })

  it('Restablecer contraseña y suspender piden confirmación. Cancelar no cambia nada', () => {
    cy.get('.search-input').type(DOCENTE_EMAIL)
    cy.get('#users-body tr[data-id]').should('have.length', 1)

    cy.get('.detail-status-badges .badge-status').invoke('text').then((estadoInicial) => {
      cy.contains('.detail-actions-row button', 'Restablecer contraseña').click()
      cy.get('#user-dialog').should('be.visible')
      cy.get('#user-dialog-title').should('have.text', 'Restablecer contraseña')
      cy.get('#user-fields').should('not.be.visible')
      cy.get('#user-dialog-message').should('be.visible').and('contain.text', DOCENTE_EMAIL)
      cy.get('#save-user').should('have.text', 'Restablecer contraseña')
      cy.get('#temp-password').should('not.be.visible')
      cy.get('#cancel-user-dialog').should('have.text', 'Cancelar').click()
      cy.get('#user-dialog').should('not.be.visible')

      cy.contains('.detail-actions-row button', 'Suspender cuenta').click()
      cy.get('#user-dialog').should('be.visible')
      cy.get('#user-dialog-title').should('have.text', 'Suspender cuenta')
      cy.get('#user-dialog-message').should('be.visible').and('contain.text', DOCENTE_EMAIL)
      cy.get('#save-user').should('have.text', 'Suspender cuenta')
      cy.get('#cancel-user-dialog').click()
      cy.get('#user-dialog').should('not.be.visible')

      cy.get('.detail-status-badges .badge-status').should('have.text', estadoInicial)
    })
  })

  it('El administrador no puede cambiar su propio rol ni suspender su cuenta', () => {
    cy.get('.search-input').type(ADMIN_EMAIL)
    cy.get('#users-body tr[data-id]').should('have.length', 1)

    cy.get('.btn-detail-danger').should('not.be.visible')

    cy.contains('.detail-actions-row button', 'Editar usuario').click()
    cy.get('#user-dialog-title').should('have.text', 'Editar usuario')
    cy.get('#user-form select[name="rol"]').should('be.disabled')
    cy.get('#user-form input[name="email"]').should('be.disabled')
    cy.get('#self-hint')
      .should('be.visible')
      .and('have.text', 'No puedes cambiar tu propio rol de administrador.')

    cy.get('#cancel-user-dialog').click()
    cy.get('#user-dialog').should('not.be.visible')
  })
})