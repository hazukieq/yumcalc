const DATA_LEN=256
var static_vars={
    'step':0,
    'cnt':0,
    'Buf':[],
    'len':0,
    'crc16':0,
    'stat':0,
}
const parseResult={
    'data':'',
    'cmd':0
}


const crc16_create=(data,len)=>{
    let CRC16 = 0xFFFF;
    for (let i = 0; i < len; i++) {
        CRC16 ^= (typeof data=='string')?data.charCodeAt(i):data[i]
        for (let j = 0; j < 8; j++) {
            let state = CRC16 & 0x01;
            CRC16 >>= 1;
            if (state) {
                CRC16 ^= 0xA001;
            }
        }
    }
    //console.log("CRC16=>",CRC16)
    //console.log("crc16_create=>",{data,len,CRC16}) 
    return CRC16;
}



const receiveData=(byte_data)=>{
    byte_data = typeof byte_data == 'string' ? byte_data.charCodeAt() : byte_data;
    if (static_vars.step == 0) {
        if (byte_data == 0x5a) {
            static_vars.step++;
            static_vars.cnt = 0;

            parseResult.cmd = 0;
            parseResult.data = '';

            static_vars.Buf.push(byte_data);
            static_vars.stat = 0;
            static_vars.cnt++;
        }
    } else if (static_vars.step == 1) {
        if (byte_data == 0xa5) {
            static_vars.step++;
            static_vars.Buf.push(byte_data);
            static_vars.cnt++;
        } else if (byte_data == 0x5a) static_vars.step = 1;
        else static_vars.step = 0;
    } else if (static_vars.step == 2) {
        static_vars.step++;
        static_vars.Buf.push(byte_data);
        static_vars.cnt++;
        //----note that here is no any translation for that!--//
        static_vars.len = byte_data; //parseInt(byte_data,16)
        //console.log(static_vars.len)
        //console.log({ buf: static_vars.Buf, byte_data, len: parseInt(byte_data, 16) });
    } else if (static_vars.step == 3) {
        static_vars.step++;
        static_vars.Buf.push(byte_data);
        static_vars.cnt++;
    } else if (static_vars.step == 4) {
        static_vars.Buf.push(byte_data);
        static_vars.cnt++;
        //为什么要DATALEN呢？因为data段长度已经固定，即便不够依然会用0x0填充
        if (DATA_LEN + 4 == static_vars.cnt) static_vars.step++;
        //console.log("keep going!now step is 4th")
    } else if (static_vars.step == 5) {
        static_vars.step++;
        static_vars.crc16 = byte_data;
        //console.log("5th...")
    } else if (static_vars.step == 6) {
        let loaw_8bits = byte_data;
        static_vars.crc16 = (static_vars.crc16 << 8) | loaw_8bits;
        let new_crc16 = crc16_create(static_vars.Buf.slice(4, static_vars.len + 4), static_vars.len);
        if (static_vars.crc16 == new_crc16) {
            static_vars.step++;
            //console.log(static_vars.crc16) 
            //console.log("crc16 corrected!")
        }
        else if (byte_data == 0x5a) {
            static_vars.step = 1;
            //console.log("met a 0x5a so go back to 1st")
        }
        else {
            static_vars.step = 0;
            console.log("what a damn, the crc16 seems fault...", static_vars.crc16, '!=', new_crc16);
        }
    } else if (static_vars.step == 7) {
        if (byte_data == 0xff) {
            let cmd = parseInt(static_vars.Buf[3], 16);
            let data = static_vars.Buf.slice(4,static_vars.len+4).flatMap((item) =>String.fromCharCode(item)).join('');

            static_vars.stat = 1;
            parseResult.cmd = cmd;
            parseResult.data = data;

            static_vars.step = 0;
            static_vars.Buf = [];
            static_vars.len = 0;
            static_vars.crc16 = 0;
        } else if (byte_data == 0xa5)
            static_vars.step = 1;
        else static_vars.step = 0;
    } else static_vars.step = 0;
}


const createData=(_cmd,str)=>{
    let head=[0x5a,0xa5]
    let len=str.length>DATA_LEN?DATA_LEN:str.length
    console.log(len)
    let cmd=_cmd
    
    let  data=[DATA_LEN]
    for(let i=0;i<DATA_LEN;i++){
        data[i]=i<len?str.charCodeAt(i):0x00
    }

    let crc16_arr=[2]
    let crc16=crc16_create(data,len)
    crc16_arr[0]=(crc16>>8)
    crc16_arr[1]=crc16&0xff
    //console.log(crc16_arr)
    let end=0xff

    //console.log({len,data,crc16})

    dataframe=[].concat(head,len,cmd,data,crc16_arr,end)
    console.log(dataframe)
    return dataframe
}


const sendToNative=(cmd,datas)=>{
    let dataframe=createData(cmd,datas)
    let binaryString = dataframe.map(num => 'x'+num.toString(16)).join('');
    console.log(binaryString)
    //NJs.send(binaryString)
    return binaryString
}

const receiveFromNative=(raw_data)=>{
    if(raw_data!=undefined&&raw_data!=null&&typeof raw_data=='string'&&raw_data.length>0){
        let data=raw_data.split('x').slice(1)
        
        for(d of data) receiveData(parseInt('0x'+d,16))
        
        if(static_vars.stat==1)
            //execute something according to status!
            execCmdFromNative(parseResult.cmd,parseResult.data)   
        
    }
}


const execCmdFromNative=(cmd,dats)=>{
    console.log(`cmd=${cmd}, datas=${dats}`)
    console.log("execue something based on the state!")  
    let obj=JSON.parse(dats)
    console.log(obj)
    console.log(typeof dats)//JSON.parse(receive)) 
}



const Nativejs={
    receive:receiveFromNative,
    send:sendToNative
}


const test_Unprotocol=()=>{
    let obj_str=JSON.stringify({arg:"hello",arg1:",world!",check:"...."})
    console.log(obj_str)
    let raw=sendToNative(0x01,obj_str)//"x5axa5x1bx01x7bx61x72x67x31x3ax27x68x65x6cx6cx6fx27x2cx61x72x67x32x3ax27x77x6fx72x6cx64x27x7dx00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x00x66x86xff"
    receiveFromNative(raw)
    //sendToNative(0x01," s"))
}

//    console.log(Nativejs)