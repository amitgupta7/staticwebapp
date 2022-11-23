let params = (new URL(document.location)).searchParams;
let name = params.get("name");
document.cookie = `tracking=${document.location}`
(async function() {
    apiRep = await( await fetch(`/api/message?name=${name}`)).json();
    document.querySelector('#message').textContent = apiRep.message;
}());