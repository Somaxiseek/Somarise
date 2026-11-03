// User-selected product estimate, not a universal hydration prescription.
function estimate(weightKg,coefficient=35){return {minMl:Math.round(weightKg*35),maxMl:Math.round(weightKg*40),targetMl:Math.round(weightKg*coefficient)};}
module.exports={estimate};
