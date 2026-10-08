import { describe,it,expect } from 'vitest';
import { parseIdentityText } from '../src/main/ocr-parser';
describe('CCCD text parsing',()=>{
 it('extracts labeled fields and multiline HKTT without treating hometown as residence',()=>{
 const result=parseIdentityText(`CĂN CƯỚC CÔNG DÂN
 Số / No.: 079090001234
 Họ và tên / Full name:
 NGUYỄN VĂN THỬ
 Ngày sinh / Date of birth: 10/02/1990
 Giới tính / Sex: Nam
 Quê quán / Place of origin: Bình Định
 Nơi thường trú / Place of residence:
 123 Nguyễn Trãi, Phường Bến Thành,
 Thành phố Hồ Chí Minh
 Có giá trị đến / Date of expiry: 10/02/2030
 Ngày, tháng, năm / Date, month, year: 20/08/2022`);
 expect(result.fields).toMatchObject({identityNumber:'079090001234',fullName:'NGUYỄN VĂN THỬ',birthDate:'1990-02-10',issueDate:'2022-08-20',permanentAddress:'123 Nguyễn Trãi, Phường Bến Thành, Thành phố Hồ Chí Minh'});
 });
 it('supports newer card residence label and preserves editable extracted values',()=>{const r=parseIdentityText('Số định danh cá nhân: 001234567890\nHọ, chữ đệm và tên khai sinh: TRẦN VĂN THỬ\nNgày, tháng, năm sinh: 01/01/1988\nNơi cư trú: 45 Đường Thử, Hà Nội\nNgày cấp: 05/05/2024');expect(r.fields).toMatchObject({fullName:'TRẦN VĂN THỬ',permanentAddress:'45 Đường Thử, Hà Nội',identityNumber:'001234567890',issueDate:'2024-05-05'});});
 it('leaves HKTT missing when only hometown is available',()=>{expect(parseIdentityText('Quê quán: Hải Phòng\nNgày sinh: 02/03/1990').fields.permanentAddress).toBeUndefined();});
 it('never fabricates dates and does not confuse expiry with issue date',()=>{const r=parseIdentityText('Ngày sinh: 31/02/1990\nCó giá trị đến: 10/02/2030');expect(r.fields.birthDate).toBeUndefined();expect(r.fields.issueDate).toBeUndefined();});
 it('stops residence at front/back or machine readable boundaries',()=>{const r=parseIdentityText('Nơi thường trú: 123 Đường Thử\nĐặc điểm nhận dạng: Nốt ruồi\nIDVNM001234567890');expect(r.fields.permanentAddress).toBe('123 Đường Thử');});
 it('handles bilingual labels split over adjacent lines',()=>{const r=parseIdentityText('Họ và tên / Full name:\nNGUYỄN THỊ THỬ\nNgày sinh / Date of birth:\n02/03/1991\nNơi thường trú / Place of residence:\nẤp Thử, Xã Thử');expect(r.fields).toMatchObject({fullName:'NGUYỄN THỊ THỬ',birthDate:'1991-03-02',permanentAddress:'Ấp Thử, Xã Thử'});});
 it('reports unreadable data instead of suggesting success',()=>{const r=parseIdentityText('blur noise xyz');expect(r.fields).toEqual({});expect(r.warnings.length).toBeGreaterThan(0);});
});

