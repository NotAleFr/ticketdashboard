export function setupCounter(element) {
  let counter = 0
  const setCounter = (count) => {
    counter = count
    element.innerHTML = `Count is ${counter}`
  }
  element.addEventListener('click', () => setCounter(counter + 1))
  setCounter(0)
}

export function countOpenTickets(tickets) {
  return tickets.filter(ticket => ticket.estado === 'Abierto').length;
}
