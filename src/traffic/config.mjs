export const PROFILES={high:{moving:62,parked:12},medium:{moving:30,parked:7},low:{moving:14,parked:3}};
export const VEHICLES={
 taxi:{width:1.72,length:4.5,height:1.5,speed:10,accel:1.8,brake:4,weight:23,color:0x3f927c,roofSign:true},
 sedan:{width:1.78,length:4.6,height:1.45,speed:11,accel:1.9,brake:4,weight:25,color:0x879ba9},
 kei:{width:1.45,length:3.35,height:1.55,speed:9,accel:1.7,brake:4,weight:18,color:0xd9c78e},
 van:{width:1.75,length:4.6,height:2,speed:9,accel:1.5,brake:4,weight:12,color:0xd4d8d4},
 bus:{width:2.35,length:9,height:3,speed:8,accel:1.2,brake:3,weight:5,color:0x8dafb5,majorOnly:true,livery:'bus'},
 keiTruck:{width:1.45,length:3.4,height:1.75,speed:8,accel:1.5,brake:4,weight:11,color:0xc9d5d0},
 scooter:{width:.7,length:1.85,height:1.25,speed:8,accel:1.8,brake:4,weight:6,color:0xb96553}
};
export const MAJOR=new Set(['trunk','primary','secondary','tertiary','trunk_link','primary_link','secondary_link','tertiary_link']);
export const DRIVEABLE=new Set([...MAJOR,'residential','unclassified','service','living_street']);
