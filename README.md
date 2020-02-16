# Emyto Token Escrow

Un escrow tiene 3 actores:

- El agente: Es el encargado de desempatar
- El depositante: Es el encargado de depositar la garantia, una vez depositada, enviarla al depositario o esperar a que el depositario la devuelva
- El depositario: Es el encargado de devolver la garantia depositada o esperar a recibirla

Ademas tiene:

- Un identificador unico
- Un fee destinado al agente una vez que la garantia es retirada
- Un address que hacer referencia al token al que esta valuado el escrow
- Un balance que corresponde a la cantidad de tokens que tiene el escrow

Los porcentajes del contrato estan calculados en base 10000, esto quiere decir que:

- 10000 correspode a un 100%
- 1 corresponde a un 0.01%
- 12345 corresponde a un 123.45%

## Crear un escrow

Existen 2 tipos de funciones:

### createEscrow(address _depositant, address _retreader, uint256 _fee, IERC20 _token, uint256 _salt)

Junto con la funcion signedCreateEscrow es el primer paso para crear un escrow

Asigna como agente del escrow al que envia esta transaccion

Crea un escrow con los parametros enviados

- El depositante
- El depositario
- El fee
- El token
- El salt que es una especie de pimienta que se le agrega al el identificador del escrow

Una vez creado al escrow se le asigna un identificados usando la funcion calculateId

Como maximo el agente de un escrow puede perdir un 10% de fee

### signedCreateEscrow(address _agent, address _depositant, address _retreader, uint256 _fee, IERC20 _token, uint256 _salt, bytes calldata _agentSignature)

Igual que la funcion createEscrow, pero puede ser enviada por otra direccion

El agente puede entregar su firma, autorizando a otra direccion para crear el escrow por el

El agente puede cancelar esta firma, siempre y cuando el escrow no halla sido creado

Ademas de los parametros de create escrow se necesitan

- La direccion del agente
- La firma del agente

### cancelSignature(address _depositant, address _retreader, uint256 _fee, IERC20 _token, uint256 _salt)

Cancela una firma de un agente, tomando como parametros:

- El depositante
- El depositario
- El fee
- El token
- El salt

## Depositar garantia

Para depositar la garantia el escrow tiene que haber sido creado

Solo el depositante del escrow puede enviar esta transaccion y previamente tiene que haber aprobado al contrato para que maneje el monto a depositar

### deposit(bytes32 _escrowId, uint256 _amount)

La funcion deposit es la encargada de depositar la garantia y toma como parametros:

- El identificador del escrow
- El monto sustraer del depositante para depositarlo en el escrow, restando el fee del dueno

Al depositar la garantia el dueno del contrato cobra un fee que es asignado con la funcion setOwnerFee

Al monto depositado se le descontara este fee, con lo cual el escrow quedara con:

```
montoParaDueno = montoASustraer * feeDueno
montoDepositado = montoASustraer - montoParaDueno
nuevoBalance = balanceAnterior + montoDepositado
```

Con el fee valuado en %, por ejemplo:

```
balanceAnterior = 1000 Token
montoASustraer = 78837 Token
feeDueno = 0.05%

montoParaDueno = 78837 Token * 0.05 = 3941 Token
montoDepositado = 78837 Token - 3941 Token = 74896 Token
nuevoBalance = 1000 Token + 74896 Token = 75896 Token
```

\* Recordar que son numeros enteros y que siempre se redonde hacia abajo

## Retirar garantia

Una vez depositada la garantia existen dos caminos, uno que la garantia sea devuelta al depositante y otra que sea enviada el depositario

Al retirar garantia el agente del escrow cobra un fee puesto en la creacion del escrow, cabe recordar que el fee puede ser gratuito(0)

Al monto a retirar se le descontara este fee, con lo cual el escrow quedara con:


```
montoParaAgente = montoARetirar * feeEscrow
montoRetirado = montoARetirar + montoParaAgente
nuevoBalance = balanceAnterior - montoRetirado
```

con el fee valuado en %, por ejemplo:

```
balanceAnterior = 100000 Token
montoARetirar = 78837 Token
feeEscrow = 0.05%

montoParaAgente = 78837 Token * 0.05 = 3941 Token
montoRetirado = 78837 Token + 3941 Token = 74896 Token
nuevoBalance = 100000 Token - 74896 Token = 75896 Token
```

\* Recordar que son numeros enteros y que siempre se redonde hacia abajo

Para esto existen 2 funciones:

### withdrawToRetreader(bytes32 _escrowId, uint256 _amount)

Esta funcion es encargada de enviar la garantia al depositario

Puede ser enviada por el agente o el depositante del escrow y toma como parametros:

- El identificador del escrow
- El monto a enviar


### withdrawToDepositant(bytes32 _escrowId, uint256 _amount)

Esta funcion es encargada de devolver la garantia al depositante

Puede ser enviada por el agente o el depositario del escrow y toma como parametros:

- El identificador del escrow
- El monto a devolver

## Cancelar un escrow

Una vez creado el escrow puede ser cancelado

### cancel(bytes32 _escrowId)

Toma el identificador del escrow como parametro

Esta transaccion solo puede ser enviada por el agente del escrow

Borra el escrow del storage y envia el balance de este hacia el depositante

## funciones de dueno

### setOwnerFee(uint256 _ownerFee)

Asigna el fee del dueno y solo el dueno del contrato puede enviar esta transaccion

Como maximo el dueno del contrato puede perdir un 50% de fee

### ownerWithdraw(IERC20 _token, address _to, uint256 _amount)

Retira los fondos acumulados obtenidos por el fee del dueno y solo el dueno del contrato puede enviar esta transaccion

Tiene como parametros:

- El address del token del cual se realizara el retiro de fondos
- Un address destino, donde iran estos fondos
- El monto a retirar

## funcion para calcular el identificador del escrow

Es una funcion de ayuda para calcular el id de un futuro o actual escrow

Toma como parametros los mismos que la funcion createEscrow, agregando

- La direccion del agente

Esta funcion crea un identificador usando la funcion keccak256, usando como parametros de esta:

- La direccion del contrato de escrow
- La direccion de agente
- La direccion de depositante
- La direccion de depositario
- El fee
- La direccion del token
- El salt

## Running the tests

This project uses Truffle for tests. Truffle's version of `solc` needs to be at least 0.5.11 for the contracts to compile.
Open your console and run:

    $ git clone git@github.com:rotcivegaf/emyto-token-escrow.git
    $ cd emyto-token-escrow
    $ npm install

Now in one console, open the ganache-cli:

    $ ./node_modules/.bin/ganache-cli

And in other console(in the same folder), run the tests with truffle:

    $ ./node_modules/.bin/truffle test

## Authors

* **Victor Fage** - *Initial work* - [rotcivegaf](https://github.com/rotcivegaf)
