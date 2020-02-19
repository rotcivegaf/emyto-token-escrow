# Emyto Token Escrow

Un escrow tiene 3 actores:

- El agente: Es el encargado de desempatar en una disputa
- El depositante: Es el encargado de depositar la garantía, una vez depositada, enviarla al depositario o esperar a que el depositario la devuelva
- El depositario: Es el encargado de devolver la garantía depositada o esperar a recibirla

Además tiene:

- Un identificador único
- Una comisión destinada al agente una vez que la garantía es retirada
- Un address que hacer referencia al token al que esta valuado el escrow
- Un balance que corresponde a la cantidad de tokens que tiene el escrow

Emyto descuenta un 0.25% de comisión en cada deposito de garantía en carácter de costo por el desarrollo del contrato y la plataforma

Esta comisión puede cambiar variando de un 0.5% hasta un 0%, dejando gratuito su uso

Esta garantía puede ser devuelta si el escrow tiene un token sin contenido económico intrínseco por ejemplo representativos de una hipoteca, equity tokens, etc. que queden en poder de Emyto, puede comunicarse vía mail y recuperarlos (a cambio del valor representado en otro token)

Los porcentajes del contrato están calculados en base 10000, esto quiere decir que:

- 10000 corresponde a un 100%
- 1 corresponde a un 0.01%
- 12345 corresponde a un 123.45%

## Crear un escrow

Existen 2 tipos de funciones:

### createEscrow(address _depositant, address _retreader, uint256 _fee, IERC20 _token, uint256 _salt)

Junto con la función signedCreateEscrow es el primer paso para crear un escrow

Asigna como agente del escrow al que envía esta transacción

Crea un escrow con los parámetros enviados:

- El depositante
- El depositario
- El porcentaje de comisión dirigida al agente
- El token
- El salt que es una especie de pimienta que se le agrega a la funcion para calcular el identificador del escrow

Una vez creado al escrow se le asigna un identificados usando la función calculateId

Como máximo el agente de un escrow puede pedir un 10% de comisión

### signedCreateEscrow(address _agent, address _depositant, address _retreader, uint256 _fee, IERC20 _token, uint256 _salt, bytes calldata _agentSignature)

Igual que la función createEscrow, pero puede ser enviada por otra dirección

El agente puede entregar su firma, autorizando a otra dirección para crear el escrow por el

El agente puede cancelar esta firma, siempre y cuando el escrow no haya sido creado

Además de los parámetros de create escrow se necesitan:

- La dirección del agente
- La firma del agente

### cancelSignature(bytes calldata _agentSignature)

Cancela una firma de un agente, tomando como parámetros:

- La firma

## Depositar garantía

Para depositar la garantía el escrow tiene que haber sido creado

Solo el depositante del escrow puede enviar esta transacción y previamente tiene que haber aprobado al contrato para que maneje el monto a depositar

### deposit(bytes32 _escrowId, uint256 _amount)

La función deposit es la encargada de depositar la garantía y toma como parámetros:

- El identificador del escrow
- El monto a sustraer del depositante para depositarlo en el escrow, restando la comisión de Emyto

Al depositar la garantía Emyto cobra una comisión que es asignada con la función setEmytoFee

Al monto depositado se le descontara esta comisión, con lo cual el escrow quedara con:

```
montoParaEmyto = montoASustraer * comisiónEmyto
montoDepositado = montoASustraer - montoParaEmyto
nuevoBalance = balanceAnterior + montoDepositado
```

Con la comisión valuada en %, por ejemplo:

```
balanceAnterior = 1000 Token
montoASustraer = 78837 Token
comisiónEmyto = 0.05%

montoParaEmyto = 78837 Token * 0.05 = 3941 Token
montoDepositado = 78837 Token - 3941 Token = 74896 Token
nuevoBalance = 1000 Token + 74896 Token = 75896 Token
```

\* Recordar que son números enteros y que siempre se redondea hacia abajo

## Retirar garantía

Una vez depositada la garantía existen dos caminos, uno que la garantía sea devuelta al depositante y otra que sea enviada el depositario

Al retirar garantía el agente del escrow cobra una comisión puesta en la creación del escrow, cabe recordar que la comisión puede ser gratuita(0)

Al monto a retirar se le descontara esta comisión, con lo cual el escrow quedara con:

```
montoParaAgente = montoARetirar * comisiónEscrow
montoRetirado = montoARetirar + montoParaAgente
nuevoBalance = balanceAnterior - montoRetirado
```

Con la comisión valuada en %, por ejemplo:

```
balanceAnterior = 100000 Token
montoARetirar = 78837 Token
comisiónEscrow = 0.05%

montoParaAgente = 78837 Token * 0.05 = 3941 Token
montoRetirado = 78837 Token + 3941 Token = 74896 Token
nuevoBalance = 100000 Token - 74896 Token = 75896 Token
```

\* Recordar que son números enteros y que siempre se redondea hacia abajo

Para esto existen 2 funciones:

### withdrawToRetreader(bytes32 _escrowId, uint256 _amount)

Esta función es encargada de enviar la garantía al depositario

Puede ser enviada por el agente o el depositante del escrow y toma como parámetros:

- El identificador del escrow
- El monto a enviar


### withdrawToDepositant(bytes32 _escrowId, uint256 _amount)

Esta función es encargada de devolver la garantía al depositante

Puede ser enviada por el agente o el depositario del escrow y toma como parámetros:

- El identificador del escrow
- El monto a devolver

## Cancelar un escrow

Una vez creado el escrow puede ser cancelado

### cancel(bytes32 _escrowId)

Toma el identificador del escrow como parámetro

Esta transacción solo puede ser enviada por el agente del escrow

Borra el escrow del storage y envía el balance de este hacia el depositante

## Funciones de dueño

### setEmytoFee(uint256 _fee)

Asigna la comisión de Emyto y solo Emyto puede enviar esta transacción

Como máximo Emyto puede pedir un 0.5% de comisión, y 0% como mínimo

### emytoWithdraw(IERC20 _token, address _to, uint256 _amount)

Retira los fondos acumulados obtenidos por Emyto y solo Emyto puede enviar esta transacción

Tiene como parámetros:

- El address del token del cual se realizara el retiro de fondos
- Un address destino, donde irán estos fondos
- El monto a retirar

## función para calcular el identificador del escrow

Es una función de ayuda para calcular el id de un futuro o actual escrow


### function calculateId(address _agent, address _depositant, address _retreader, uint256 _fee, IERC20 _token, uint256 _salt)

Toma como parámetros los mismos que la función createEscrow, agregando:

- La dirección del agente

Esta función crea un identificador usando la función keccak256, usando como parámetros de esta:

- La dirección del contrato de escrow
- La dirección de agente
- La dirección de depositante
- La dirección de depositario
- La comisión
- La dirección del token
- El salt

## Correr los tests

Este proyecto usa Truffle para correr los tests. Truffle necesita por lo menos la versión 0.5.11 de `solc` para compilar los contratos

Abre una consola y ejecuta estos códigos:

    $ git clone git@github.com:rotcivegaf/emyto-token-escrow.git
    $ cd emyto-token-escrow
    $ npm install

Ahora en esa consola, ejecuta ganache-cli, que levanta una instancia local de la blockchan de ethereum:

    $ ./node_modules/.bin/ganache-cli

Y en otra conosola(dentro de la misma carpeta), ejecuta los test con Truffle

    $ ./node_modules/.bin/truffle test

## Autores

* **Victor Fage** - *Initial work* - [rotcivegaf](https://github.com/rotcivegaf)
