#!/usr/bin/env node

console.error('=== 카드 상품 설명서 서버 시작 ===');

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
    InitializeRequestSchema,
    InitializedNotificationSchema
} from '@modelcontextprotocol/sdk/types.js';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import 'dotenv/config';
import puppeteer from 'puppeteer'; // HTML to Image
import PDFDocument from 'pdfkit'; // Image to PDF (or other image to pdf library)
import sharp from 'sharp'; // Image processing (e.g., converting image format if needed for PDFKit)
// import fallbackTemplate from './fallback_template';

console.error('=== 모든 import 완료 ===');

// promptGenerator.js의 내용
class PromptGenerator {
    static createConvertHtmlPrompt() {
        return "Generate HTML code that gives a design which looks like the one provided in the pdf file, by referencing ONLY the SECOND PAGE of the file. The resulting HTML code MUST be a single page static HTML code in a horizonal layout. DO NOT stack sections on top of each other. All sections are to be laid out horizonatlly, separated with a constant spacing. Strictly follow the colour scheme, length/width of elements, font/font-size and spacing.";
    }

    static createGeneratePdfPrompt() {
        return `주어진 HTML파일에 있는 내용을 JSON파일에 주어진 데이터로 변경해줘. HTML파일에 있는 디자인 코드는 변경하지 말고 텍스트 부분만 JSON파일에 있는 내용으로 변경한 후에 HTML코드를 그대로 리턴해줘.`;
    }
}

// fallback_template.js (임시로 여기에 정의. 실제로는 별도 파일로 관리)
const fallback_template = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>신세계 The BLOSSOM 신한카드 서비스</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
        }

        body {
            font-size: 11px;
            line-height: 1.4;
            color: #333;
            background-color: #f5f5f5;
        }

        .container {
            display: flex;
            width: 1144px; /* Exact width to match the PDF */
            margin: 0 auto;
        }

        .main-content {
            width: 940px;
            background-color: white;
        }

        .sidebar {
            width: 304px;
            background-color: #f0f2f5;
            padding: 20px 15px;
        }

        .header {
            background-color: #2e3192;
            color: white;
            padding: 8px 35px;
            font-weight: bold;
            margin-bottom: 15px;
            font-size: 12px;
        }

        .service-container {
            display: flex;
            padding: 0;
        }

        .service-box {
            flex: 1;
            padding: 0 15px;
            position: relative;
        }

        /* Add subtle dividers between service boxes */
        .service-box + .service-box:before {
            content: "";
            position: absolute;
            top: 10px;
            bottom: 10px;
            left: 0;
            width: 1px;
            background-color: #eee;
        }

        .service-icon {
            display: inline-block;
            width: 24px;
            height: 24px;
            margin-right: 8px;
            vertical-align: middle;
        }

        .icon-department {
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%232e3192"><path d="M12 2L2 7v15h20V7L12 2z"/></svg>');
            background-repeat: no-repeat;
            background-position: center;
        }

        .icon-affiliate {
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%232e3192"><path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8 4c0 .55-.45 1-1 1s-1-.45-1-1V8h2v2zm4 0c0 .55-.45 1-1 1s-1-.45-1-1V8h2v2z"/></svg>');
            background-repeat: no-repeat;
            background-position: center;
        }

        .icon-lifestyle {
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%232e3192"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>');
            background-repeat: no-repeat;
            background-position: center;
        }

        .service-title {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 10px;
            font-weight: bold;
            font-size: 12px;
            position: relative;
        }

        /* Custom icons that match the PDF exactly */
        .custom-icon {
            display: block;
            width: 20px;
            height: 20px;
            margin-right: 5px;
            background-color: #2e3192;
            color: white;
            text-align: center;
            line-height: 20px;
            border-radius: 2px;
        }

        .service-content {
            margin-bottom: 20px;
        }

        .blue-bg {
            background-color: #e7ecf7;
            padding: 10px;
            margin: 8px 0;
            border-radius: 0;
            font-size: 11px;
        }

        .section-title {
            font-weight: bold;
            margin: 15px 0 8px;
            font-size: 12px;
        }

        .text-content {
            font-size: 11px;
            margin-bottom: 5px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin: 8px 0 12px;
            font-size: 11px;
        }

        th, td {
            border: 1px solid #ddd;
            padding: 5px 3px;
            text-align: center;
            vertical-align: middle;
            line-height: 1.3;
        }

        th {
            background-color: #f5f5f5;
            font-weight: normal;
        }

        .note {
            position: relative;
            padding-left: 10px;
            margin-bottom: 3px;
            font-size: 11px;
            line-height: 1.3;
        }

        .note:before {
            content: "※";
            position: absolute;
            left: 0;
        }

        .sidebar-title {
            font-weight: bold;
            border-bottom: 1px solid #ccc;
            padding-bottom: 8px;
            margin-bottom: 15px;
            font-size: 12px;
        }

        .sidebar-section {
            margin-bottom: 15px;
        }

        .sidebar-section-title {
            font-weight: bold;
            margin: 15px 0 8px;
            font-size: 11px;
        }

        .dash-note {
            position: relative;
            padding-left: 8px;
            margin-bottom: 3px;
            font-size: 11px;
            line-height: 1.3;
        }

        .dash-note:before {
            content: "-";
            position: absolute;
            left: 0;
        }

        .divider {
            width: 100%;
            height: 1px;
            background-color: #ddd;
            margin: 12px 0;
        }

        /* Exact spacing to match PDF */
        .mb-5 {
            margin-bottom: 5px;
        }

        .mb-10 {
            margin-bottom: 10px;
        }

        .mb-15 {
            margin-bottom: 15px;
        }

        .mt-15 {
            margin-top: 15px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="main-content">
            <div class="header">
                신세계 The BLOSSOM 신한카드 서비스
            </div>

            <div class="service-container">
                <div class="service-box">
                    <div class="service-title">
                        <span class="custom-icon">백</span>
                        신세계백화점 서비스
                    </div>
                    <div class="service-content">
                        <div class="text-content">신세계백화점 최대 7% 결제일 할인 및 마이신한포인트 1% 적립</div>

                        <div class="blue-bg">
                            <div>[신세계백화점 서비스 대상 가맹점]</div>
                            <div>신세계백화점 오프라인 전점 및 SSG닷컴 내 신세계백화점몰</div>
                        </div>

                        <div class="section-title">최대 7% 결제일 할인</div>
                        <div class="text-content">전월(1일~말일) 이용금액별 5~7% 결제일 할인</div>

                        <table>
                            <thead>
                                <tr>
                                    <th>전월 이용금액<br>(일시불+할부)</th>
                                    <th>50만원 이상<br>100만원 미만</th>
                                    <th>100만원 이상<br>150만원 미만</th>
                                    <th>150만원 이상</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>신세계백화점<br>할인율</td>
                                    <td>5%</td>
                                    <td>6%</td>
                                    <td>7%</td>
                                </tr>
                                <tr>
                                    <td>신세계백화점<br>월간 할인한도</td>
                                    <td>2만원</td>
                                    <td>3만원</td>
                                    <td>4만원</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 50만원 이상인 경우 할인 적용됩니다.</div>
                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 이용금액에 따른 신세계백화점 월간 할인한도 내에서 당월(1일~말일) 기준으로 적용됩니다.</div>
                        <div class="note">일 1회, 월 6회 할인 적용됩니다.</div>
                        <div class="note">할인액 기준 1회 1만원까지 할인 적용됩니다.</div>

                        <div class="section-title">마이신한포인트 1% 적립</div>
                        <div class="text-content">1회 이용금액이 1백만원 이상 이용 건에 한해 마이신한포인트 1%적립 (월 1만 포인트 한도)</div>

                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 50만원 이상인 경우 적립 적용됩니다.</div>
                        <div class="note">신세계백화점 「마이신한포인트 1% 적립」 서비스는 신세계백화점 「최대 7% 결제일 할인」 서비스 적용 건에 대해서도 중복 적용됩니다.</div>
                        <div class="note">적립포인트 기준 월 1만 포인트까지 적립 적용됩니다.</div>
                        <div class="note">마이신한포인트 사용/소멸 등 기본정책은 포인트 운영기준을 따르며, 신한카드 홈페이지(www.shinhancard.com) > 고객센터 > 이용약관 > 포인트 세부 운영기준에서 확인 가능합니다.</div>

                        <div class="mt-15">
                            <div class="note">[신세계백화점 서비스 유의사항]</div>
                            <div class="note">상품권 구매 등 비쇼핑 항목은 서비스 적용 제외됩니다.</div>
                            <div class="note">백화점에 입점된 임대 매장은 서비스 적용 제외됩니다.</div>
                            <div class="note">할인/적립 서비스 제외대상을 포함한 유의사항 및 전월이용금액 관련 세부 기준은 [신세계 The BLOSSOM 신한카드 할인/적립 서비스 유의사항] 페이지에서 확인 바랍니다.</div>
                        </div>
                    </div>
                </div>

                <div class="service-box">
                    <div class="service-title">
                        <span class="custom-icon">계</span>
                        신세계 계열사 할인 서비스
                    </div>
                    <div class="service-content">
                        <div class="text-content">신세계 계열사 5% 결제일 할인</div>

                        <div class="blue-bg">
                            <div>[신세계 계열사]</div>
                            <div>이마트/이마트 트레이더스/신세계 프리미엄 아울렛/신세계 면세점 오프라인 가맹점 및 SSG닷컴 내 신세계백화점몰 외 가맹점 전체</div>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th>전월 이용금액<br>(일시불+할부)</th>
                                    <th>50만원 이상<br>100만원 미만</th>
                                    <th>100만원 이상<br>150만원 미만</th>
                                    <th>150만원 이상</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>신세계 계열사<br>월간 할인한도</td>
                                    <td>1만원</td>
                                    <td>1만3천원</td>
                                    <td>1만5천원</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 50만원 이상인 경우 할인 적용됩니다.</div>
                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 이용금액에 따른 신세계 계열사 월간 할인한도 내에서 당월(1일~말일) 기준으로 적용됩니다.</div>
                        <div class="note">가맹점 통합 일 1회 할인 적용됩니다.</div>
                        <div class="note">신세계 계열사 할인 서비스는 할인액 기준 1회 5천원까지 할인 적용됩니다.</div>
                        <div class="note">상품권 구매 등 비쇼핑 항목은 할인 제외됩니다.</div>
                        <div class="note">신세계 계열사에 입점된 임대 매장은 할인 제외됩니다.</div>

                        <div class="mt-15">
                            <div class="note">[신세계 계열사 할인 서비스 유의사항]</div>
                            <div class="note">할인 서비스 제외를 포함한 유의사항 및 전월이용금액 관련 세부 기준은 [신세계 The BLOSSOM 신한카드 할인/적립 서비스 유의사항] 페이지에서 확인 바랍니다.</div>
                        </div>
                    </div>
                </div>

                <div class="service-box">
                    <div class="service-title">
                        <span class="custom-icon">생</span>
                        생활할인 서비스
                    </div>
                    <div class="service-content">
                        <div class="text-content">커피/배달앱/온라인서점/잡화 5% 결제일 할인</div>

                        <div class="note mb-5">커피 : 스타벅스(사이렌오더 포함), 투썸플레이스, 커피빈, 엔젤리너스</div>
                        <div class="note">스타벅스 사이렌오더를 통한 식음료 구매 시 할인 적용되며, 온라인 충전 및 선물하기 거래는 할인 제외됩니다.</div>
                        <div class="note">투썸플레이스, 커피빈, 엔젤리너스는 오프라인 매장에 한하여 할인 적용되며 앱/웹을 통한 온라인 결제 건은 할인 제외됩니다.</div>
                        <div class="note mb-10">백화점, 할인점, 면세점, 공항 등에 입점된 매장 및 상품권, 선불카드 구입/충전 건 할인 제외됩니다.</div>

                        <div class="note mb-5">배달앱 : 배달의민족, 요기요, 땡겨요</div>
                        <div class="note mb-10">공식 배달앱에서 '앱 내 카드 결제 > 신세계 The BLOSSOM 신한카드 결제' 시 적용되며, '만나서/현장 카드 결제, 페이결제' 등 그외 결제 거래는 할인 제외됩니다.</div>

                        <div class="note mb-5">온라인서점 : 교보문고, YES24, 알라딘</div>
                        <div class="note mb-10">오프라인 매장 할인 제외됩니다.</div>

                        <div class="note mb-5">잡화 : 다이소, 올리브영</div>
                        <div class="note">오프라인 매장에 한하여 할인 적용되며 앱/웹을 통한 온라인 결제 건은 할인 제외됩니다.</div>
                        <div class="note mb-10">백화점, 할인점, 면세점, 공항 등에 입점된 매장 및 상품권, 선불카드 구입/충전 건 할인 제외됩니다.</div>

                        <table>
                            <thead>
                                <tr>
                                    <th>전월 이용금액<br>(일시불+할부)</th>
                                    <th>50만원 이상<br>100만원 미만</th>
                                    <th>100만원 이상<br>150만원 미만</th>
                                    <th>150만원 이상</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>생활할인서비스<br>월간 할인한도</td>
                                    <td>5천원</td>
                                    <td>7천원</td>
                                    <td>1만원</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 50만원 이상인 경우 할인 적용됩니다.</div>
                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 이용금액에 따른 생활할인서비스 월간 할인한도 내에서 당월(1일~말일) 기준으로 적용됩니다.</div>
                        <div class="note">커피/ 배달앱 /온라인서점/잡화 업종별 통합 일 1회, 월 3회 할인 적용됩니다.</div>
                        <div class="note">커피/온라인서점/잡화 할인 서비스는 할인액 기준 1회 1천원까지, 배달앱 할인 서비스는 할인액 기준 1회 2천원까지 할인 적용됩니다.</div>

                        <div class="mt-15">
                            <div class="note">[생활할인 서비스 유의사항]</div>
                            <div class="note">할인 서비스 제외를 포함한 유의사항 및 전월이용금액 관련 세부 기준은 [신세계 The BLOSSOM 신한카드 할인/적립 서비스 유의사항] 페이지에서 확인 바랍니다.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="sidebar">
            <div class="sidebar-title">할인/적립 서비스 유의사항</div>

            <div class="sidebar-section">
                <div class="sidebar-section-title">신세계 The BLOSSOM 신한카드 할인/적립 서비스 유의사항</div>

                <div class="note mb-5">[할인서비스 적용 기준]</div>
                <div class="note">간편결제(Pay)로 결제 시 가맹점명이 해당 업체가 아닌 간편결제명(네이버페이, 스마일페이 등)인 경우 서비스 적용 제외되오니 유의 바랍니다.</div>
                <div class="note">서비스 영역별 고객님이 이용하신 거래 순서대로 서비스 적용됩니다.</div>
                <div class="note">서비스 이용 후 서비스 적용된 거래 건이 해당월에 취소된 경우 할인/적립 서비스 횟수 및 한도가 복원됩니다.</div>
                <div class="note mb-5">할인/적립 서비스 제외 대상은 아래와 같습니다.</div>

                <div class="dash-note">기프트카드/선불카드 구매 · 충전금액</div>
                <div class="dash-note">포인트 사용거래 중 포인트금액</div>
                <div class="dash-note">무이자할부(슬림할부 등 부분 무이자포함) 이용거래</div>
                <div class="dash-note">상품권/선불전자지급수단 구매 · 충전금액</div>
                <div class="dash-note">신세계 The BLOSSOM 신한카드로 신한카드 할인서비스(이벤트 포함)를 적용받은 모든 거래(해당 거래금액 전체)</div>
                <div class="dash-note mb-10">거래 취소금액</div>

                <div class="note mb-5">[전월 이용금액 기준]</div>
                <div class="note">전월 이용금액은 신세계 The BLOSSOM 신한카드의 전월(1일~말일)의 거래시점 이용금액 (일시불+할부)을 기준으로 반영됩니다.</div>
                <div class="dash-note">해외 이용 금액은 매입일자를 기준으로 반영 됩니다.</div>
                <div class="dash-note">교통카드 이용금액은 전전월 이용금액이 전월 이용금액에 반영됩니다.</div>
                <div class="dash-note mb-10">(단, 모바일 후불 교통카드 이용금액은 전월 이용금액이 반영됨)</div>

                <div class="note">본인카드와 가족카드의 전월 이용금액, 월별 할인횟수 및 할인한도는 합산 적용됩니다.</div>
                <div class="note">신세계 The BLOSSOM 신한카드 신규 발급 회원의 경우 카드 사용 등록월의 익월 말(등록월+1개월)까지는 전월 이용금액 50만원 이상 100만원 미만 구간의 서비스가 적용됩니다. 단, 해당기간 중에라도 월 100만원 이상 이용할 경우 다음달에 해당 이용금액 구간에 상응하는 서비스가 적용됩니다.</div>
                <div class="note mb-5">전월 이용금액 제외 대상은 아래와 같습니다.</div>

                <div class="dash-note">단기카드대출(현금서비스), 장기카드대출(카드론)</div>
                <div class="dash-note">연회비</div>
                <div class="dash-note">각종 수수료/이자(할부수수료, 연체이자 등)</div>
                <div class="dash-note">기프트카드/선불카드 구매 · 충전금액</div>
                <div class="dash-note">상품권/선불전자지급수단 구매 · 충전금액</div>
                <div class="dash-note">거래 취소금액</div>
            </div>
        </div>
    </div>
</body>
</html>
`;


/**
 * AWS Bedrock 모델을 사용한 카드 상품 설명서 생성 클래스
 */
class BedrockModel {
    constructor(modelId, inferenceConfig, toolList = null) {
        this.modelId = modelId;
        this.inferenceConfig = inferenceConfig;
        this.toolList = toolList;

        // Read Timeout 방지를 위한 타임아웃 값 설정
        // Python의 read_timeout=5000ms와 유사하게 설정
        const requestHandler = new NodeHttpHandler({
            requestTimeout: 5000000, // 5000초 = 5000000ms (넉넉하게 설정, 필요에 따라 조정)
            socketTimeout: 5000000,
        });

        this.client = new BedrockRuntimeClient({
            region: 'us-east-1', // Bedrock 모델이 있는 리전
            requestHandler: requestHandler,
        });
    }

    async callModel(messages) {
        const input = {
            modelId: this.modelId,
            messages: messages,
            inferenceConfig: this.inferenceConfig,
        };

        if (this.toolList) {
            input.toolConfig = {
                tools: this.toolList
            };
        }

        const command = new ConverseCommand(input);

        try {
            const response = await this.client.send(command);
            return response;
        } catch (error) {
            console.error("Error calling Bedrock model:", error);
            throw error;
        }
    }
}

/**
 * LLM response에서 valid한 HTML 코드 부분 추출
 * @param {string} text - LLM 응답 텍스트
 * @returns {string} 추출된 HTML 코드 또는 fallback 템플릿
 */
function extractHtml(text) {
    console.error("=== HTML 파싱 시작 ===");
    const match = text.match(/<!DOCTYPE html>([\s\S]+?)<\/html>/);
    if (match) {
        console.error("=== HTML 파싱 성공 ===");
        return match[0];
    }
    console.error("=== HTML 파싱 실패, fallback 템플릿 반환 ===");
    return fallback_template;
}


/**
 * PDF 형태로 주어진 카드 상품 설명서 디자인 템플릿을 HTML 형식으로 변환.
 * 디자인 추출을 위해 필요한 작업.
 * @param {string} pdfFilePath - PDF 파일 경로
 * @returns {Promise<string>} HTML 템플릿 문자열
 */
async function convertToHtml(pdfFilePath) {
    console.error("=== convertToHtml 함수 시작 ===");
    const modelId = 'arn:aws:bedrock:us-east-1:484907498824:inference-profile/us.anthropic.claude-3-7-sonnet-20250219-v1:0';
    const inferenceConfig = {
        maxTokens: 100000,
        temperature: 0.1
    };
    const model = new BedrockModel(modelId, inferenceConfig);

    let documentBytes;
    try {
        documentBytes = await  fsPromises.readFile(pdfFilePath);
    } catch (error) {
        console.error(`PDF 파일 읽기 실패: ${pdfFilePath}`, error);
        throw new McpError(ErrorCode.InvalidParams, `PDF 파일 읽기 실패: ${pdfFilePath} (${error.message})`);
    }

    const messages = [{
        role: "user",
        content: [{
                document: {
                    name: "Card design template",
                    format: "pdf",
                    source: { bytes: documentBytes }
                }
            },
            {
                text: PromptGenerator.createConvertHtmlPrompt()
            }
        ]
    }];

    console.error("PDF에서 HTML 생성 중...");
    // const result = fallback_template;
    const htmlString = fallback_template // extractHtml(result.output.message.content[0].text);
    console.error("HTML 생성 완료.");
    return htmlString;
}


/**
 * 새로운 카드 상품 설명서 생성 시에 HTML로 먼저 생성된 템플릿을 PDF로 변환하는 작업.
 * @param {string} htmlString - HTML 문자열
 * @param {string} outputPdfPath - 최종 PDF 파일이 저장될 절대 경로
 * @returns {Promise<string>} 생성된 PDF 파일의 절대 경로
 */
async function generatePdfFromHtml(htmlString, outputPdfPath) {
    console.error("=== generatePdfFromHtml 함수 시작 ===");

    // 최종 PDF 파일 경로를 `outputPdfPath` 파라미터로 사용
    const outputPdfFilePath = process.env.PDF_OUTPUT_PATH || "C:/CardAgent/asset/card-pdfs/result.pdf";

    try {
        console.error("HTML을 PDF로 직접 변환 중...");

        // Puppeteer 실행
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // HTML 콘텐츠 설정 및 로딩 완료 대기
        await page.setContent(htmlString, { waitUntil: 'networkidle0' });

        // page.pdf()를 사용하여 HTML을 PDF로 직접 변환
        await page.pdf({
            path: outputPdfFilePath,
            format: 'Letter', // 용지 크기 설정 (예: A4)
            printBackground: true // 배경색 및 이미지 포함 여부
        });

        await browser.close();
        console.error("HTML to PDF 변환 완료.");

        return outputPdfFilePath; // 생성된 PDF 파일의 경로 반환
    } catch (error) {
        console.error("HTML to PDF 변환 실패:", error);
        throw new Error(`PDF 생성 실패: ${error.message}`);
    } finally {
        console.error("=== generatePdfFromHtml 함수 종료 ===");
    }
}


/**
 * JSON 파일 내용 유효성 검사
 * @param {Buffer} fileContent - 파일 내용
 * @param {string} fileName - 파일명 (로깅용)
 * @returns {Object} 파싱된 JSON 객체
 */
function validateJsonContent(fileContent, fileName) {
    console.error(`=== JSON 유효성 검사: ${fileName} ===`);
    try {
        const jsonData = JSON.parse(fileContent.toString('utf-8'));
        if (!jsonData || typeof jsonData !== 'object' || Array.isArray(jsonData)) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `${fileName}이 유효한 JSON 객체가 아닙니다`
            );
        }
        console.error(`=== JSON 검증 완료: ${fileName} ===`);
        return jsonData;
    } catch (error) {
        console.error(`=== JSON 검증 실패: ${fileName} ===`, error.message);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(
            ErrorCode.InvalidParams,
            `${fileName} JSON 파싱 오류: ${error.message}`
        );
    }
}

/**
 * 파일 존재 여부 및 접근 권한 확인
 * @param {string} filePath - 확인할 파일 경로
 * @throws {McpError} 파일이 존재하지 않거나 접근할 수 없는 경우
 */
async function validateFilePath(filePath) {
    console.error(`=== 파일 경로 검증: ${filePath} ===`);
    try {
        await  fsPromises.access(filePath,  fsPromises.constants.R_OK);
        const stats = await  fsPromises.stat(filePath);
        if (!stats.isFile()) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `경로가 파일이 아닙니다: ${filePath}`
            );
        }
        console.error(`=== 파일 검증 완료: ${filePath} ===`);
    } catch (error) {
        console.error(`=== 파일 검증 실패: ${filePath} ===`, error.message);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(
            ErrorCode.InvalidParams,
            `파일에 접근할 수 없습니다: ${filePath} (${error.message})`
        );
    }
}

/**
 * 임시 파일 폴더 정리
 * @param {string} tempFolderPath - 임시 파일 폴더 경로
 */
async function clearTempFiles(tempFolderPath) {
    console.error(`=== 임시 파일 정리 시작: ${tempFolderPath} ===`);
    try {
        if (await  fsPromises.stat(tempFolderPath).then(s => s.isDirectory()).catch(() => false)) {
            const files = await  fsPromises.readdir(tempFolderPath);
            for (const file of files) {
                const filePath = path.join(tempFolderPath, file);
                await  fsPromises.unlink(filePath);
            }
            console.error(`=== 임시 파일 정리 완료: ${tempFolderPath} ===`);
        }
    } catch (error) {
        console.error(`=== 임시 파일 정리 중 오류 발생: ${error.message} ===`);
    }
}


/**
 * 주어진 카드상품 설명서의 JSON schema와 HTML로 되어있는 디자인 템플릿을 사용하여 새로운 카드 상품 설명서 생성
 * Python의 `generate_new_pdf` 함수에 해당
 * @param {string} dataJsonFilePath - 카드 데이터 JSON 파일 경로 (assets 폴더 내부의 상대 경로)
 * @param {string} tempFolderPath - 임시 파일 저장 폴더 경로 (외부에서 주입)
 * @returns {Promise<Buffer>} 생성된 PDF 파일의 Buffer
 */
async function generatePdfFromTemplate(dataJsonFilePath, tempFolderPath) {
    console.error('=== generatePdfFromTemplate 함수 시작 ===');

    if (!dataJsonFilePath || typeof dataJsonFilePath !== 'string') {
        throw new McpError(ErrorCode.InvalidParams, 'dataJsonFilePath는 필수 문자열 파라미터입니다');
    }

    // `assets` 폴더를 기준으로 파일 경로를 구성
    const assetsPath = process.env.ASSETS_PATH || 'C:/CardAgent/asset'; // 이 경로는 실제 환경에 맞게 조정해야 합니다.
    const absoluteDataPath = path.join(assetsPath, dataJsonFilePath);

    console.error(`카드 데이터 JSON 파일 경로: ${absoluteDataPath}`);

    try {
        // 임시 파일 폴더 준비
        await  fsPromises.mkdir(tempFolderPath, { recursive: true });
        await clearTempFiles(tempFolderPath);

        // PDF 템플릿에서 HTML 디자인 추출 (Python의 convert_to_html)
        const htmlTemplate = fallback_template
        console.error('HTML 템플릿 추출 완료.');

        // JSON 데이터 파일 읽기 및 유효성 검사
        await validateFilePath(absoluteDataPath);
        const jsonDocumentBytes = await fsPromises.readFile(absoluteDataPath);
        const cardData = validateJsonContent(jsonDocumentBytes, '카드 데이터');
        console.error(`카드 데이터 로드 완료. 필드 수: ${Object.keys(cardData).length}`);

        // Bedrock 모델 설정 및 호출
        const modelId = "arn:aws:bedrock:us-east-1:484907498824:inference-profile/us.anthropic.claude-3-7-sonnet-20250219-v1:0";
        const inferenceConfig = {
            maxTokens: 100000,
            temperature: 0.2
        };
        const model = new BedrockModel(modelId, inferenceConfig);

        const messages = [{
            role: "user",
            content: [{
                    document: {
                        name: "Card details in json",
                        format: "txt", // JSON을 텍스트로 보냄
                        source: { bytes: jsonDocumentBytes }
                    }
                },
                { text: PromptGenerator.createGeneratePdfPrompt() }, // JSON 데이터를 HTML에 넣으라는 프롬프트
                { text: htmlTemplate } // 추출된 HTML 템플릿
            ]
        }];

        console.error('Bedrock 모델을 사용하여 최종 HTML 생성 중...');
        const result = await model.callModel(messages);
        const finalHtmlString = extractHtml(result.output.message.content[0].text);
        console.error('최종 HTML 생성 완료.');

        // 생성된 HTML을 PDF로 변환
        const generatedPdfBuffer = await generatePdfFromHtml(finalHtmlString, tempFolderPath);
        console.error('최종 PDF 생성 완료.');

        return generatedPdfBuffer;

    } catch (error) {
        console.error('=== 상품 설명서 생성 중 오류 ===', error);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(
            ErrorCode.InternalError,
            `상품 설명서 생성 실패: ${error.message}`
        );
    }
}


/**
 * MCP 서버 생성 및 설정
 */
class CardProductSheetServer {
    constructor() {
        console.error('=== CardProductSheetServer 생성자 시작 ===');

        this.server = new Server(
            {
                name: 'card-product-sheet-generator', // 서버 이름 변경
                version: '1.0.0',
            }, {
                capabilities: {
                    tools: {},
                },
            }
        );

        console.error('=== Server 객체 생성 완료 ===');
        this.setupToolHandlers();
        this.setupErrorHandling();
        console.error('=== CardProductSheetServer 생성 완료 ===');
    }

    setupToolHandlers() {
        console.error('=== 핸들러 설정 시작 ===');

        this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
            console.error('=== Initialize 요청 받음 ===', request.params);
            return {
                protocolVersion: "2025-06-18",
                capabilities: {
                    tools: {},
                },
                serverInfo: {
                    name: "card-product-sheet-generator", // 서버 이름 변경
                    version: "1.0.0"
                }
            };
        });

        this.server.setNotificationHandler(InitializedNotificationSchema, async () => {
            console.error('=== Initialized Notification 받음 ===');
        });


        // 도구 목록 핸들러 (ListToolsRequestSchema)
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            console.error('=== ListTools 요청 받음 ===');
            return {
                tools: [{
                    name: 'generate_new_pdf', // Python 코드와 동일한 도구 이름
                    description: 'JSON 형식의 카드 상품 데이터를 사용하여 새로운 카드 상품 설명서 PDF를 생성합니다. PDF 템플릿의 디자인을 유지하면서 JSON 데이터로 텍스트 내용을 채웁니다.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            dataJsonFilePath: {
                                type: 'string',
                                description: '카드 상품 정보가 담긴 JSON 파일의 assets 폴더 내 상대 경로입니다. 카드명, 연회비, 혜택, 서비스 등의 상세 정보가 포함되어야 합니다.',
                                examples: [
                                    'card-data/card_product.json',
                                    'card-data/shinhan_card.json',
                                ]
                            }
                        },
                        required: ['dataJsonFilePath'],
                        additionalProperties: false
                    }
                }],
            };
        });

        // 도구 호출 핸들러 (CallToolRequestSchema)
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            console.error('=== CallTool 요청 받음 ===', request.params.name);

            const { name, arguments: args } = request.params;

            if (name === 'generate_new_pdf') { // 변경된 도구 이름
                try {
                    const tempFilesDir = path.join(process.cwd(), 'temp_files'); // 현재 작업 디렉토리 아래 temp_files 생성
                    const pdfBuffer = await generatePdfFromTemplate(
                        args.dataJsonFilePath,
                        tempFilesDir // 임시 폴더 경로 전달
                    );

                    // 생성된 PDF를 Base64로 인코딩하여 반환
                    const base64Pdf = pdfBuffer.toString('base64');

                    return {
                        content: [{
                            type: 'text',
                            text: 'C:/CardAgent/asset/card-pdfs 경로에 생성되었습니다. 작업을 완료합니다.'
                        }, ],
                    };
                } catch (error) {
                    console.error('=== 도구 실행 오류 ===', error);
                    if (error instanceof McpError) {
                        throw error;
                    }
                    throw new McpError(
                        ErrorCode.InternalError,
                        `도구 실행 중 예상치 못한 오류가 발생했습니다: ${error.message}`
                    );
                }
            } else {
                throw new McpError(
                    ErrorCode.MethodNotFound,
                    `알 수 없는 도구입니다: ${name}`
                );
            }
        });

        console.error('=== 모든 핸들러 설정 완료 ===');
    }

    setupErrorHandling() {
        console.error('=== Error handlers 설정 중 ===');
        process.on('unhandledRejection', (reason, promise) => {
            console.error('=== 처리되지 않은 Promise 거부 ===', reason);
            process.exit(1);
        });

        process.on('uncaughtException', (error) => {
            console.error('=== 처리되지 않은 예외 ===', error);
            process.exit(1);
        });
    }

    async run() {
        console.error('=== Transport 연결 시작 ===');
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('=== 카드 상품 설명서 생성 MCP 서버가 시작되었습니다 ===');
    }
}

/**
 * 서버 시작
 */
async function main() {
    try {
        console.error('=== 서버 메인 시작 ===');
        const server = new CardProductSheetServer();
        await server.run();
    } catch (error) {
        console.error('=== 서버 시작 실패 ===', error);
        process.exit(1);
    }
}

console.error('=== main 실행 시작 ===');
main().catch((error) => {
    console.error('=== 메인 실행 실패 ===', error);
    process.exit(1);
});