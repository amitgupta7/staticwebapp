function setCookie(cname, cvalue, exdays) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    let expires = "expires="+ d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
  }
let params = (new URL(document.location)).searchParams;
let name = params.get("name");
setCookie("tracking", `${document.location.toString()}`, 1000);
(async function() {
    apiRep = await( await fetch(`/api/message?name=${name}`)).json();
    document.querySelector('#message').textContent = apiRep.message;
}());